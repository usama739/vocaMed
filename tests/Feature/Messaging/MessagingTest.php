<?php

namespace Tests\Feature\Messaging;

use App\Booking\BookingRequest;
use App\Booking\BookingService;
use App\Enums\BookingSource;
use App\Jobs\SendMessage;
use App\Messaging\Channels\LogChannel;
use App\Messaging\Channels\MailChannel;
use App\Messaging\Contracts\MessageChannel;
use App\Messaging\DeliveryFailed;
use App\Messaging\Messenger;
use App\Messaging\OutgoingMessage;
use App\Models\Appointment;
use App\Models\Clinic;
use App\Models\Doctor;
use App\Models\Message;
use App\Models\NotificationTemplate;
use App\Models\Patient;
use App\Models\Service;
use App\Models\User;
use App\Support\TenantContext;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use RuntimeException;
use Tests\Concerns\AssertsShape;
use Tests\Concerns\BuildsBookingWorld;
use Tests\TestCase;

/** Messages to patients: what is filed when, what it says, how it is sent, what happens when it cannot be, and resending. */
class MessagingTest extends TestCase
{
    use AssertsShape, BuildsBookingWorld, RefreshDatabase;

    /** @var list<OutgoingMessage> */
    private array $mailed = [];

    /** @var list<OutgoingMessage> */
    private array $logged = [];

    private ?\Throwable $failWith = null;

    protected function setUp(): void
    {
        parent::setUp();

        $this->buildBookingWorld();
        $this->clinic->forceFill(['name' => 'Shifa Clinic'])->save();
        // Monday 10:00 in the clinic.
        Carbon::setTestNow('2026-11-02 05:00:00');
        $this->patient->forceFill(['consent_at' => now(), 'email' => 'ayesha@example.test', 'phone' => '+923001111111', 'preferred_channel' => 'email'])->save();
        $this->channelsRecord();
    }

    protected function tearDown(): void
    {
        $this->tearDownBookingWorld();

        parent::tearDown();
    }

    /** Replaces the real drivers with ones that remember what they were asked to send (and can be made to fail). */
    private function channelsRecord(): void
    {
        $test = $this;
        $recorder = fn (string $bucket) => new class($test, $bucket) implements MessageChannel
        {
            public function __construct(private readonly MessagingTest $test, private readonly string $bucket) {}

            public function send(OutgoingMessage $message): void
            {
                $this->test->deliver($this->bucket, $message);
            }
        };

        $this->app->instance(MailChannel::class, $recorder('mailed'));
        $this->app->instance(LogChannel::class, $recorder('logged'));
    }

    public function deliver(string $bucket, OutgoingMessage $message): void
    {
        if ($this->failWith !== null) {
            throw $this->failWith;
        }

        if ($bucket === 'mailed') {
            $this->mailed[] = $message;
        } else {
            $this->logged[] = $message;
        }
    }

    private function inClinic(callable $work, ?Clinic $clinic = null): mixed
    {
        return app(TenantContext::class)->run($clinic ?? $this->clinic, $work);
    }

    private function book(string $local, ?Patient $patient = null, BookingSource $source = BookingSource::Manual, ?Doctor $doctor = null): Appointment
    {
        return $this->inClinic(fn () => app(BookingService::class)->book($this->clinic, $this->reception, new BookingRequest(
            ($patient ?? $this->patient)->id, ($doctor ?? $this->doctor)->id, $this->service->id, $this->at($local), $source,
        )));
    }

    /** @return list<Message> */
    private function messages(): array
    {
        return Message::query()->withoutGlobalScopes()->orderBy('id')->get()->all();
    }

    private function line(Message $message): string
    {
        return "{$message->kind}|{$message->channel}|{$message->status}|".($message->failure_reason ?? '-');
    }

    // The three moments in a visit's life

    public function test_booking_files_a_confirmation_and_sends_it_with_a_working_private_link()
    {
        $appointment = $this->book('2026-11-04 10:00');

        $this->assertCount(1, $this->mailed);
        $mail = $this->mailed[0];
        $this->assertSame(['ayesha@example.test', 'Your appointment at Shifa Clinic'], [$mail->to, $mail->subject]);
        $this->assertStringContainsString('Hi Ayesha Khan, your appointment with Dr. Sana is booked for Wed 4 Nov, 10:00 AM at Shifa Clinic.', $mail->body);
        $this->assertSame(1, preg_match('#/p/([0-9a-f]{64})#', $mail->body, $found));
        $this->assertSame(['confirmation|email|sent|-'], array_map(fn (Message $m) => $this->line($m), $this->messages()));
        $this->assertNotNull($this->messages()[0]->sent_at);
        $this->assertSame($appointment->id, $this->messages()[0]->appointment_id);

        // The link in the message opens that visit.
        $this->getJson('/p/'.$found[1])->assertOk()->assertJsonPath('state', 'valid')->assertJsonPath('appointment.firstName', 'Ayesha');
    }

    public function test_moving_and_cancelling_file_their_own_messages_once()
    {
        $appointment = $this->book('2026-11-04 10:00');

        $this->inClinic(fn () => app(BookingService::class)->reschedule($this->clinic, $this->reception, $appointment, $this->at('2026-11-05 11:00')));
        $this->inClinic(fn () => app(BookingService::class)->cancel($appointment->fresh()));

        $this->assertSame(['confirmation', 'reschedule', 'cancellation'], array_map(fn (Message $m) => $m->kind, $this->messages()));
        $this->assertSame('Your appointment at Shifa Clinic has moved', $this->mailed[1]->subject);
        $this->assertStringContainsString('has moved to Thu 5 Nov, 11:00 AM', $this->mailed[1]->body);
        $this->assertStringContainsString('has been cancelled', $this->mailed[2]->body);
    }

    public function test_a_patient_cancelling_from_their_link_is_told_too()
    {
        $this->book('2026-11-06 10:00');
        preg_match('#/p/([0-9a-f]{64})#', $this->mailed[0]->body, $found);

        $this->postJson('/p/'.$found[1].'/cancel')->assertOk();

        $this->assertSame(['confirmation', 'cancellation'], array_map(fn (Message $m) => $m->kind, $this->messages()));
        $this->assertCount(2, $this->mailed);
    }

    public function test_a_walk_in_is_never_messaged()
    {
        $this->book('2026-11-02 10:00', null, BookingSource::WalkIn);

        $this->assertSame([], $this->messages());
        $this->assertSame([], $this->mailed);
    }

    public function test_a_message_is_filed_once_however_often_it_is_asked_for()
    {
        $appointment = $this->book('2026-11-04 10:00');

        $again = $this->inClinic(fn () => app(Messenger::class)->file($appointment->fresh(), 'confirmation'));

        $this->assertNull($again);
        $this->assertCount(1, $this->messages());
        $this->assertCount(1, $this->mailed);
    }

    // Who gets what, in what language and how

    public function test_the_clinics_own_wording_and_the_patients_language_decide_the_text()
    {
        $this->inClinic(fn () => (new NotificationTemplate)->forceFill(['kind' => 'confirmation', 'channel' => 'sms', 'locale' => 'en', 'body' => 'Dear {patient_name}: {doctor} at {time}, {clinic_name}. {link}'])->save());
        $this->book('2026-11-04 10:00');
        $this->assertStringStartsWith('Dear Ayesha Khan: Dr. Sana at Wed 4 Nov, 10:00 AM, Shifa Clinic. http', $this->mailed[0]->body);

        $urdu = Patient::factory()->forClinic($this->clinic)->create(['name' => 'Bilal Ahmed', 'email' => 'bilal@example.test', 'preferred_channel' => 'email', 'preferred_locale' => 'ur', 'consent_at' => now()]);
        $this->book('2026-11-04 11:00', $urdu);

        $this->assertSame('Shifa Clinic میں آپ کی اپائنٹمنٹ', $this->mailed[1]->subject);
        $this->assertStringContainsString('السلام علیکم Bilal Ahmed', $this->mailed[1]->body);
        $this->assertStringNotContainsString('{', $this->mailed[1]->body);
    }

    public function test_sms_and_whatsapp_patients_go_to_their_own_driver_with_their_phone()
    {
        $sms = Patient::factory()->forClinic($this->clinic)->create(['phone' => '+923002222222', 'preferred_channel' => 'sms', 'consent_at' => now()]);
        $whatsapp = Patient::factory()->forClinic($this->clinic)->create(['phone' => '+923003333333', 'preferred_channel' => 'whatsapp', 'consent_at' => now()]);
        $this->book('2026-11-04 10:00', $sms);
        $this->book('2026-11-04 11:00', $whatsapp);

        $this->assertSame([], $this->mailed);
        $this->assertSame(['+923002222222', '+923003333333'], array_map(fn (OutgoingMessage $m) => $m->to, $this->logged));
        $this->assertSame(['sms', 'whatsapp'], array_map(fn (OutgoingMessage $m) => $m->channel, $this->logged));
        $this->assertSame(['confirmation|sms|sent|-', 'confirmation|whatsapp|sent|-'], array_map(fn (Message $m) => $this->line($m), $this->messages()));
    }

    public function test_a_patient_who_has_not_consented_or_cannot_be_reached_gets_a_failed_row_and_nothing_is_sent()
    {
        $noConsent = Patient::factory()->forClinic($this->clinic)->create(['email' => 'a@example.test', 'preferred_channel' => 'email', 'consent_at' => null]);
        $noEmail = Patient::factory()->forClinic($this->clinic)->create(['email' => null, 'preferred_channel' => 'email', 'consent_at' => now()]);
        $noPhone = Patient::factory()->withoutPhone()->forClinic($this->clinic)->create(['preferred_channel' => 'sms', 'consent_at' => now()]);
        $this->book('2026-11-04 10:00', $noConsent);
        $this->book('2026-11-04 11:00', $noEmail);
        $this->book('2026-11-04 12:00', $noPhone);

        $this->assertSame([], [...$this->mailed, ...$this->logged]);
        $this->assertSame(['confirmation|email|failed|no_consent', 'confirmation|email|failed|unreachable', 'confirmation|sms|failed|unreachable'], array_map(fn (Message $m) => $this->line($m), $this->messages()));
    }

    // Sending

    public function test_sending_twice_never_sends_twice_and_a_visit_that_is_off_is_not_messaged()
    {
        Queue::fake();
        $appointment = $this->book('2026-11-04 10:00');
        $message = $this->messages()[0];
        Queue::assertPushed(SendMessage::class, 1);

        $run = fn () => app()->call([new SendMessage($message->id, $message->clinic_id), 'handle']);
        $run();
        $run();
        $this->assertCount(1, $this->mailed);
        $this->assertSame('sent', $message->fresh()->status);

        // A reminder whose visit was cancelled before the worker got to it has nothing to say, and is not kept.
        $reminder = $this->inClinic(fn () => app(Messenger::class)->file($appointment->fresh(), 'reminder', 24));
        $this->inClinic(fn () => $appointment->fresh()->forceFill(['status' => 'cancelled'])->save());
        app()->call([new SendMessage($reminder->id, $reminder->clinic_id), 'handle']);

        $this->assertCount(1, $this->mailed);
        $this->assertSame(0, Message::query()->withoutGlobalScopes()->whereKey($reminder->id)->count());
    }

    public function test_a_message_that_can_never_be_delivered_is_failed_with_the_reason()
    {
        $this->failWith = new DeliveryFailed('not_on_whatsapp');
        $whatsapp = Patient::factory()->forClinic($this->clinic)->create(['phone' => '+923003333333', 'preferred_channel' => 'whatsapp', 'consent_at' => now()]);

        $this->book('2026-11-04 10:00', $whatsapp);

        $this->assertSame(['confirmation|whatsapp|failed|not_on_whatsapp'], array_map(fn (Message $m) => $this->line($m), $this->messages()));
    }

    public function test_a_temporary_failure_is_tried_again_and_a_message_out_of_tries_is_failed()
    {
        Queue::fake();
        $this->book('2026-11-04 10:00');
        $message = $this->messages()[0];
        $job = new SendMessage($message->id, $message->clinic_id);

        $this->failWith = new RuntimeException('mail server down');
        $this->expectException(RuntimeException::class);

        try {
            app()->call([$job, 'handle']);
        } finally {
            // Still waiting: the queue will try again after its backoff.
            $this->assertSame('queued', $message->fresh()->status);
            $this->assertSame([60, 300], $job->backoff());
            $this->assertSame(3, $job->tries);

            $job->failed(new RuntimeException('gave up'));

            $this->assertSame(['failed', 'unreachable'], [$message->fresh()->status, $message->fresh()->failure_reason]);
        }
    }

    public function test_the_mail_driver_sends_a_plain_text_email_through_laravels_mail()
    {
        Mail::swap(Mail::getFacadeRoot());
        $channel = new MailChannel;

        $channel->send(new OutgoingMessage('email', 'someone@example.test', 'Hello there', 'The body text'));

        $sent = Mail::mailer('array')->getSymfonyTransport()->messages();
        $this->assertCount(1, $sent);
        $email = $sent[0]->getOriginalMessage();
        $this->assertSame('Hello there', $email->getSubject());
        $this->assertSame('someone@example.test', $email->getTo()[0]->getAddress());
        $this->assertStringContainsString('The body text', $email->getTextBody());
    }

    public function test_the_log_driver_sends_nothing()
    {
        $this->app->forgetInstance(LogChannel::class);
        $this->app->bind(LogChannel::class, fn () => new LogChannel);
        Mail::swap(Mail::getFacadeRoot());

        (new LogChannel)->send(new OutgoingMessage('sms', '+923001111111', '', 'text'));

        $this->assertCount(0, Mail::mailer('array')->getSymfonyTransport()->messages());
    }

    // Reminders

    private function remindable(string $inFromNow, ?string $createdAt = '2026-10-30 05:00:00', BookingSource $source = BookingSource::Manual, ?Patient $patient = null): Appointment
    {
        $start = now()->addMinutes((int) $inFromNow);

        return Appointment::factory()->forClinic($this->clinic, $this->doctor, $patient ?? $this->patient, $this->service)
            ->create(['starts_at' => $start, 'ends_at' => $start->copy()->addMinutes(30), 'source' => $source, 'created_at' => $createdAt]);
    }

    private function remind(): void
    {
        Artisan::call('messages:reminders');
    }

    public function test_a_reminder_is_filed_when_its_hour_comes_round_and_only_once()
    {
        // 23h 50m ahead: the 24-hour reminder came due ten minutes ago.
        $due = $this->remindable((string) (23 * 60 + 50));
        // 25 hours ahead: not due yet. 20 hours ahead: the 24-hour one was due four hours ago (past the hour's grace).
        $this->remindable((string) (25 * 60));
        $this->remindable((string) (20 * 60));

        $this->remind();
        $this->remind();

        $lines = array_map(fn (Message $m) => $m->kind.'|'.$m->appointment_id, $this->messages());
        $this->assertSame(["reminder|{$due->id}"], $lines);
        $this->assertCount(1, $this->mailed);
        $this->assertStringContainsString('Reminder: Ayesha Khan, you have an appointment with Dr. Sana at', $this->mailed[0]->body);
        $this->assertSame('Reminder: your appointment at Shifa Clinic', $this->mailed[0]->subject);
    }

    public function test_the_two_hour_reminder_and_the_twenty_four_hour_one_are_separate_messages()
    {
        $this->remindable((string) (2 * 60 - 5));
        $this->remindable((string) (24 * 60 - 5));

        $this->remind();

        $this->assertCount(2, $this->messages());
        $this->assertCount(2, array_unique(array_map(fn (Message $m) => $m->dedupe_key, $this->messages())));
    }

    public function test_a_visit_booked_inside_a_reminders_window_does_not_get_that_reminder()
    {
        // Booked 10 hours before the visit: the 24-hour reminder never applied, the 2-hour one will.
        $this->remindable((string) (23 * 60 + 50), now()->subMinutes(5)->toDateTimeString());

        $this->remind();

        $this->assertSame([], $this->messages());
    }

    public function test_cancelled_visits_walk_ins_and_other_clinics_get_the_right_reminders()
    {
        $this->remindable((string) (23 * 60 + 50), '2026-10-30 05:00:00', BookingSource::WalkIn);
        $cancelled = $this->remindable((string) (23 * 60 + 50));
        $cancelled->forceFill(['status' => 'cancelled'])->save();

        $other = Clinic::factory()->create(['country' => 'PK', 'timezone' => 'Asia/Karachi']);
        $theirDoctor = Doctor::factory()->forClinic($other)->create();
        $theirService = Service::factory()->forClinic($other)->create();
        $theirPatient = Patient::factory()->forClinic($other)->create(['email' => 'o@example.test', 'preferred_channel' => 'email', 'consent_at' => now()]);
        $start = now()->addMinutes(23 * 60 + 50);
        $theirs = Appointment::factory()->forClinic($other, $theirDoctor, $theirPatient, $theirService)->create(['starts_at' => $start, 'ends_at' => $start->copy()->addMinutes(30), 'created_at' => '2026-10-30 05:00:00']);

        $this->remind();

        $messages = $this->messages();
        $this->assertSame([$theirs->id], array_map(fn (Message $m) => $m->appointment_id, $messages));
        $this->assertSame($other->id, $messages[0]->clinic_id);
    }

    public function test_a_clinic_can_choose_its_own_reminder_hours_and_a_reminder_without_consent_is_recorded()
    {
        $this->clinic->forceFill(['settings' => ['reminderHoursBefore' => [48]]])->save();
        $quiet = Patient::factory()->forClinic($this->clinic)->create(['email' => 'q@example.test', 'preferred_channel' => 'email', 'consent_at' => null]);
        $this->remindable((string) (47 * 60 + 50), '2026-10-29 05:00:00', BookingSource::Manual, $quiet);
        $this->remindable((string) (23 * 60 + 50));

        $this->remind();

        $this->assertSame(['reminder|email|failed|no_consent'], array_map(fn (Message $m) => $this->line($m), $this->messages()));
    }

    public function test_the_reminders_run_every_minute_on_the_schedule()
    {
        $events = collect(app(Schedule::class)->events())->filter(fn ($e) => str_contains((string) $e->command, 'messages:reminders'));

        $this->assertCount(1, $events);
        $this->assertSame('* * * * *', $events->first()->expression);
        $this->assertTrue($events->first()->withoutOverlapping);
    }

    // Resend

    private function failedMessage(): Message
    {
        $quiet = Patient::factory()->forClinic($this->clinic)->create(['email' => 'q@example.test', 'preferred_channel' => 'email', 'consent_at' => null]);
        $this->book('2026-11-04 12:00', $quiet);

        return $this->messages()[0];
    }

    public function test_reception_can_send_a_failed_message_again_once_the_patient_has_consented()
    {
        $failed = $this->failedMessage();
        $this->inClinic(fn () => $failed->patient->forceFill(['consent_at' => now()])->save());

        $response = $this->actingAs($this->reception)->postJson("/reception/notifications/{$failed->id}/resend")->assertOk();

        $this->assertSame(['queued', 'confirmation'], [$response->json('status'), $response->json('kind')], 'the answer is the new message as filed; the worker sends it');
        $this->assertSame('sent', Message::query()->withoutGlobalScopes()->findOrFail($response->json('id'))->status);
        $this->assertNotSame($failed->id, $response->json('id'));
        $this->assertNotNull($failed->fresh()->resent_at);
        $this->assertSame('failed', $failed->fresh()->status, 'the log never edits a failure into a success');
        $this->assertCount(1, $this->mailed);
        $actions = DB::table('audit_logs')->whereIn('action', ['appointment.message_resent', 'notification.resent'])->pluck('action')->all();
        $this->assertEqualsCanonicalizing(['appointment.message_resent', 'notification.resent'], $actions);
        $this->assertSame((string) $this->reception->id, (string) DB::table('audit_logs')->where('action', 'notification.resent')->value('actor_id'));
    }

    public function test_only_a_failed_message_that_has_not_been_sent_again_can_be_resent()
    {
        $failed = $this->failedMessage();

        $this->actingAs($this->reception)->postJson("/reception/notifications/{$failed->id}/resend")->assertOk();
        $this->actingAs($this->reception)->postJson("/reception/notifications/{$failed->id}/resend")->assertStatus(422)->assertJson(['code' => 'INVALID_TRANSITION']);

        $this->book('2026-11-04 13:00');
        $good = collect($this->messages())->firstWhere('status', 'sent');
        $this->actingAs($this->reception)->postJson("/reception/notifications/{$good->id}/resend")->assertStatus(422);
    }

    public function test_resending_is_for_the_desk_only_and_never_across_clinics()
    {
        $failed = $this->failedMessage();
        $doctorUser = User::factory()->doctor()->forClinic($this->clinic)->create();
        $other = Clinic::factory()->create();
        $stranger = User::factory()->receptionist()->forClinic($other)->create();

        $this->actingAs($doctorUser)->postJson("/reception/notifications/{$failed->id}/resend")->assertForbidden();
        $this->actingAs($this->admin)->postJson("/reception/notifications/{$failed->id}/resend")->assertForbidden();
        $this->actingAs($stranger)->postJson("/reception/notifications/{$failed->id}/resend")->assertNotFound();
        $this->assertNull($failed->fresh()->resent_at);
    }

    // What reception sees

    public function test_the_notifications_page_lists_messages_newest_first_with_the_shape_the_screens_expect()
    {
        $this->book('2026-11-04 10:00');
        $this->failedMessage();

        $view = $this->actingAs($this->reception)->getJson('/reception/notifications')->assertOk()->json();

        $this->assertSame(['failed', 'sent'], array_column(array_column($view['rows'], 'entry'), 'status'));
        $this->assertSame('Ayesha Khan', $view['rows'][1]['patient']['name']);
        $this->assertSameShape($this->fixture('reception-notifications-view'), $view);
        $this->assertSameShape($this->fixture('message'), $view['rows'][0]['entry']);
        $this->actingAs($this->reception)->get('/reception/notifications')->assertInertia(fn ($page) => $page->component('reception/notifications'));
    }

    public function test_one_clinic_never_sees_anothers_messages()
    {
        $this->book('2026-11-04 10:00');
        $other = Clinic::factory()->create();
        $stranger = User::factory()->receptionist()->forClinic($other)->create();

        $this->assertSame([], $this->actingAs($stranger)->getJson('/reception/notifications')->assertOk()->json('rows'));
    }

    public function test_the_visits_timeline_has_its_messages_and_the_patients_replies_newest_first()
    {
        $appointment = $this->book('2026-11-06 10:00');
        preg_match('#/p/([0-9a-f]{64})#', $this->mailed[0]->body, $found);
        Carbon::setTestNow('2026-11-02 05:30:00');
        $this->postJson('/p/'.$found[1].'/confirm')->assertOk();

        $view = $this->actingAs($this->reception)->getJson("/reception/appointments/{$appointment->id}")->assertOk()->json();

        $this->assertSame(['reply', 'message'], array_column($view['timeline'], 'type'));
        $this->assertSame('confirmation', $view['timeline'][1]['entry']['kind']);
        $this->assertSame('confirm', $view['timeline'][0]['reply']['action']);
    }

    // Other places a message is owed from

    public function test_a_reschedule_request_the_doctor_approves_tells_the_patient_the_new_time()
    {
        $this->clinic->forceFill(['settings' => ['rescheduleRequiresApproval' => true]])->save();
        $me = User::factory()->doctor()->forClinic($this->clinic)->create();
        $this->doctor->forceFill(['user_id' => $me->id])->save();
        $this->book('2026-11-04 10:00');
        preg_match('#/p/([0-9a-f]{64})#', $this->mailed[0]->body, $found);
        $this->postJson('/p/'.$found[1].'/reschedule', ['startsAt' => $this->at('2026-11-05 11:00')->format('Y-m-d\TH:i:s.v\Z')])->assertOk();
        $this->assertCount(1, $this->mailed, 'asking is not a change: nothing is sent yet');

        $request = DB::table('reschedule_requests')->first();
        $this->actingAs($me)->patchJson("/doctor/requests/{$request->id}", ['decision' => 'approved'])->assertOk();

        $this->assertSame(['confirmation', 'reschedule'], array_map(fn (Message $m) => $m->kind, $this->messages()));
        $this->assertStringContainsString('Thu 5 Nov, 11:00 AM', $this->mailed[1]->body);
    }

    public function test_the_mail_test_command_sends_one_email_and_refuses_a_bad_address()
    {
        $this->artisan('mail:test', ['to' => 'me@example.test'])->expectsOutputToContain('Sent through the "array" mailer')->assertSuccessful();
        $this->assertCount(1, Mail::mailer('array')->getSymfonyTransport()->messages());

        $this->artisan('mail:test', ['to' => 'not-an-address'])->expectsOutputToContain('not an email address')->assertFailed();
    }

    public function test_message_rows_are_stored_for_their_clinic_only()
    {
        $this->book('2026-11-04 10:00');

        $this->assertSame($this->clinic->id, DB::table('messages')->value('clinic_id'));
        $this->assertSame(1, $this->inClinic(fn () => Message::query()->count()));
        $other = Clinic::factory()->create();
        $this->assertSame(0, $this->inClinic(fn () => Message::query()->count(), $other));
    }
}
