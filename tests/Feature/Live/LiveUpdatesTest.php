<?php

namespace Tests\Feature\Live;

use App\Live\LiveUpdate;
use App\Models\Appointment;
use App\Models\Clinic;
use App\Models\Doctor;
use App\Models\User;
use Illuminate\Broadcasting\BroadcastEvent;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use RuntimeException;
use Tests\Concerns\BuildsBookingWorld;
use Tests\TestCase;

/** Live updates: what is announced, to whom, that it carries nothing personal, and who may listen. */
class LiveUpdatesTest extends TestCase
{
    use BuildsBookingWorld, RefreshDatabase;

    private User $doctorUser;

    protected function setUp(): void
    {
        parent::setUp();

        $this->buildBookingWorld();

        $this->doctorUser = User::factory()->doctor()->forClinic($this->clinic)->create();
        $this->doctor->forceFill(['user_id' => $this->doctorUser->id])->save();

        // Tests run with broadcasting off; these switch it on and catch what would be sent.
        config([
            'broadcasting.default' => 'reverb',
            'broadcasting.connections.reverb.key' => 'test-key',
            'broadcasting.connections.reverb.secret' => 'test-secret',
            'broadcasting.connections.reverb.app_id' => 'test-app',
        ]);
        // Channels are registered on the broadcaster that is the default when the app starts (here the null one), so
        // they are registered again on the one just switched on.
        require base_path('routes/channels.php');

        Queue::fake();
    }

    protected function tearDown(): void
    {
        $this->tearDownBookingWorld();

        parent::tearDown();
    }

    /** @return list<LiveUpdate> */
    private function announced(): array
    {
        return Queue::pushed(BroadcastEvent::class)
            ->map(fn (BroadcastEvent $job) => $job->event)
            ->filter(fn (object $event) => $event instanceof LiveUpdate)
            ->values()
            ->all();
    }

    /** @return list<string> the topics announced, in order, without repeats */
    private function topics(): array
    {
        return array_values(array_unique(array_map(fn (LiveUpdate $event) => $event->topic, $this->announced())));
    }

    private function book(string $local = '2026-11-02 09:00'): string
    {
        return $this->actingAs($this->reception)->postJson(route('api.appointments.store'), [
            'patientId' => $this->patient->id, 'doctorId' => $this->doctor->id, 'serviceId' => $this->service->id,
            'startsAt' => $this->at($local)->toIso8601String(),
        ])->assertCreated()->json('id');
    }

    /** @return list<string> */
    private function channelNames(LiveUpdate $event): array
    {
        return array_map(fn ($channel) => $channel->name, $event->broadcastOn());
    }

    // What is announced

    public function test_booking_announces_the_appointment_to_the_clinic_and_to_that_doctor_only()
    {
        $id = $this->book();

        $events = array_values(array_filter($this->announced(), fn (LiveUpdate $e) => $e->topic === 'appointments'));

        $this->assertNotEmpty($events);

        foreach ($events as $event) {
            $this->assertSame($id, $event->id);
            $this->assertEqualsCanonicalizing(
                ["private-clinic.{$this->clinic->id}", "private-clinic.{$this->clinic->id}.doctor.{$this->doctor->id}"],
                $this->channelNames($event),
            );
        }
    }

    public function test_what_is_sent_names_the_topic_and_the_record_and_nothing_personal()
    {
        $this->book();

        foreach ($this->announced() as $event) {
            $this->assertSame(['topic', 'id'], array_keys($event->broadcastWith()));
            $this->assertSame('live', $event->broadcastAs());
            $this->assertStringNotContainsString('Ayesha', json_encode([$event->broadcastWith(), $this->channelNames($event)]));
        }
    }

    public function test_every_kind_of_change_to_an_appointment_is_announced()
    {
        $id = $this->book();

        foreach ([
            fn () => $this->actingAs($this->reception)->patchJson(route('api.appointments.status', $id), ['status' => 'confirmed'])->assertOk(),
            fn () => $this->actingAs($this->reception)->patchJson(route('api.appointments.reschedule', $id), ['startsAt' => $this->at('2026-11-02 11:00')->toIso8601String()])->assertOk(),
            fn () => $this->actingAs($this->reception)->postJson(route('api.appointments.cancel', $id))->assertOk(),
        ] as $change) {
            Queue::fake();
            $change();

            $this->assertContains('appointments', $this->topics());
        }
    }

    public function test_the_messages_filed_for_a_booking_are_announced_to_reception_but_not_to_the_doctor()
    {
        $this->book();

        $messages = array_values(array_filter($this->announced(), fn (LiveUpdate $e) => $e->topic === 'messages'));

        $this->assertNotEmpty($messages);

        foreach ($messages as $event) {
            $this->assertSame(["private-clinic.{$this->clinic->id}"], $this->channelNames($event));
        }
    }

    public function test_taking_and_letting_go_of_a_slot_is_announced_as_slots()
    {
        $this->actingAs($this->reception)->postJson(route('api.holds.store'), [
            'doctorId' => $this->doctor->id, 'serviceId' => $this->service->id, 'startsAt' => $this->at('2026-11-02 10:00')->toIso8601String(),
        ])->assertCreated();

        $this->assertContains('slots', $this->topics());
    }

    public function test_changes_to_the_clinics_directory_and_history_are_announced()
    {
        $this->actingAs($this->admin)->putJson(route('admin.services.update', $this->service->id), [
            'name' => 'Check-up plus', 'durationMin' => 30, 'bufferMin' => 10, 'doctorIds' => [$this->doctor->id],
        ])->assertOk();

        $topics = $this->topics();

        $this->assertContains('directory', $topics);
        $this->assertContains('audit', $topics);
    }

    public function test_a_change_that_rolls_back_announces_nothing()
    {
        $id = $this->book();
        Queue::fake();

        try {
            DB::transaction(function () use ($id): void {
                Appointment::query()->findOrFail($id)->forceFill(['reason' => 'changed my mind'])->save();

                throw new RuntimeException('rolled back');
            });
        } catch (RuntimeException) {
            // expected
        }

        $this->assertSame([], $this->announced());
    }

    public function test_nothing_is_sent_when_broadcasting_is_off()
    {
        config(['broadcasting.default' => 'null']);

        $this->book();

        $this->assertSame([], $this->announced());
    }

    public function test_another_clinics_changes_never_reach_this_clinics_channels()
    {
        $other = Clinic::factory()->create(['timezone' => 'Asia/Karachi']);
        Queue::fake();

        $this->book();

        foreach ($this->announced() as $event) {
            foreach ($this->channelNames($event) as $name) {
                $this->assertStringNotContainsString($other->id, $name);
            }
        }
    }

    // Who may listen

    private function authorize(?User $as, string $channel): int
    {
        $as === null || $this->actingAs($as);

        return $this->postJson('/broadcasting/auth', ['socket_id' => '1234.5678', 'channel_name' => "private-{$channel}"])->status();
    }

    public function test_reception_and_the_admin_may_listen_to_their_clinic()
    {
        $this->assertSame(200, $this->authorize($this->reception, "clinic.{$this->clinic->id}"));
        $this->assertSame(200, $this->authorize($this->admin, "clinic.{$this->clinic->id}"));
    }

    public function test_a_doctor_may_not_listen_to_the_whole_clinic()
    {
        $this->assertSame(403, $this->authorize($this->doctorUser, "clinic.{$this->clinic->id}"));
    }

    public function test_a_doctor_may_listen_to_their_own_channel_and_no_one_elses()
    {
        $this->assertSame(200, $this->authorize($this->doctorUser, "clinic.{$this->clinic->id}.doctor.{$this->doctor->id}"));

        $colleague = Doctor::factory()->forClinic($this->clinic)->create();

        $this->assertSame(403, $this->authorize($this->doctorUser, "clinic.{$this->clinic->id}.doctor.{$colleague->id}"));
    }

    public function test_reception_and_the_admin_may_not_use_a_doctors_own_channel()
    {
        $channel = "clinic.{$this->clinic->id}.doctor.{$this->doctor->id}";

        $this->assertSame(403, $this->authorize($this->reception, $channel));
        $this->assertSame(403, $this->authorize($this->admin, $channel));
    }

    public function test_nobody_may_listen_to_another_clinic()
    {
        $other = Clinic::factory()->create();
        $otherDoctor = Doctor::factory()->forClinic($other)->create();

        $this->assertSame(403, $this->authorize($this->reception, "clinic.{$other->id}"));
        $this->assertSame(403, $this->authorize($this->admin, "clinic.{$other->id}"));
        $this->assertSame(403, $this->authorize($this->doctorUser, "clinic.{$other->id}.doctor.{$otherDoctor->id}"));
        // A doctor's id under the wrong clinic is not theirs either.
        $this->assertSame(403, $this->authorize($this->doctorUser, "clinic.{$other->id}.doctor.{$this->doctor->id}"));
    }

    public function test_someone_signed_out_may_not_listen()
    {
        $this->assertContains($this->authorize(null, "clinic.{$this->clinic->id}"), [401, 403]);
    }

    // Which channel each person is told to use

    public function test_every_page_tells_the_signed_in_person_which_channel_to_listen_on()
    {
        $this->actingAs($this->reception)->get('/reception')->assertInertia(fn ($page) => $page->where('auth.liveChannel', "clinic.{$this->clinic->id}"));
        $this->actingAs($this->admin)->get('/admin')->assertInertia(fn ($page) => $page->where('auth.liveChannel', "clinic.{$this->clinic->id}"));
        $this->actingAs($this->doctorUser)->get('/doctor')->assertInertia(fn ($page) => $page->where('auth.liveChannel', "clinic.{$this->clinic->id}.doctor.{$this->doctor->id}"));
    }
}
