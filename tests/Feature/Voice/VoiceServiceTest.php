<?php

namespace Tests\Feature\Voice;

use App\Models\Clinic;
use App\Models\Doctor;
use App\Models\Patient;
use App\Models\ScheduleRule;
use App\Models\Service;
use App\Support\TenantContext;
use App\Voice\ParsedIntent;
use App\Voice\VoiceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsBookingWorld;
use Tests\TestCase;

/**
 * The resolver: heard words to this clinic's real patient, doctor, service and a time that can really be booked, with a warning on
 * everything it is unsure of. The clinic is the booking world: Dr. Sana works Monday to Friday 09:00 to 17:00 and does Check-up (30
 * minutes); now is Sunday 2026-11-01 15:00 in Karachi.
 */
class VoiceServiceTest extends TestCase
{
    use BuildsBookingWorld, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->buildBookingWorld();
        $this->patient->forceFill(['phone' => '+923001234567'])->save();
    }

    protected function tearDown(): void
    {
        $this->tearDownBookingWorld();

        parent::tearDown();
    }

    /**
     * Resolve inside the clinic, the way the job does.
     *
     * @param  array<string, string|null>  $fields
     * @return array<string, mixed>
     */
    private function resolve(array $fields): array
    {
        $intent = new ParsedIntent(
            ParsedIntent::BOOK,
            $fields['patientName'] ?? null,
            $fields['patientPhone'] ?? null,
            $fields['doctorName'] ?? null,
            $fields['serviceName'] ?? null,
            $fields['date'] ?? null,
            $fields['time'] ?? null,
        );

        return app(TenantContext::class)->run($this->clinic, fn () => app(VoiceService::class)->resolve($this->clinic, 'what was said', $intent)->toArray());
    }

    /** A complete, certain request for Monday 10:00. */
    private function certain(array $overrides = []): array
    {
        return $this->resolve(['patientName' => 'Ayesha Khan', 'doctorName' => 'Sana', 'date' => '2026-11-02', 'time' => '10:00', ...$overrides]);
    }

    public function test_a_complete_request_resolves_to_real_records_with_nothing_to_check()
    {
        $draft = $this->certain();

        $this->assertSame([
            'heard' => 'what was said',
            'patientId' => $this->patient->id,
            'patientName' => 'Ayesha Khan',
            'phone' => '+923001234567',
            'doctorId' => $this->doctor->id,
            'serviceId' => $this->service->id,
            'startsAt' => '2026-11-02T05:00:00.000Z',
            'lowConfidence' => [],
        ], $draft);
    }

    // ---- patient ----

    public function test_a_phone_number_finds_the_patient_whatever_name_was_heard_for_them()
    {
        $named = $this->certain(['patientName' => 'Ayesha', 'patientPhone' => '0300 1234567']);
        $mismatch = $this->certain(['patientName' => 'Bilal Hussain', 'patientPhone' => '0300-1234567']);

        $this->assertSame($this->patient->id, $named['patientId']);
        $this->assertNotContains('patient', $named['lowConfidence']);

        $this->assertSame($this->patient->id, $mismatch['patientId']);
        $this->assertContains('patient', $mismatch['lowConfidence'], 'A phone number that belongs to a different name is worth a second look.');
    }

    public function test_a_name_in_another_spelling_or_script_finds_the_patient()
    {
        $ahmed = Patient::factory()->forClinic($this->clinic)->create(['name' => 'Ahmed Raza']);

        $this->assertSame($ahmed->id, $this->certain(['patientName' => 'ahmed raza'])['patientId']);
        $this->assertSame($ahmed->id, $this->certain(['patientName' => 'احمد رضا'])['patientId']);
        $this->assertSame($this->patient->id, $this->certain(['patientName' => 'Aisha Khan'])['patientId']);
    }

    public function test_two_patients_with_the_same_first_name_are_a_toss_up_and_ask_for_a_check()
    {
        Patient::factory()->forClinic($this->clinic)->create(['name' => 'Ayesha Malik']);

        $draft = $this->certain(['patientName' => 'Ayesha']);

        $this->assertNotNull($draft['patientId']);
        $this->assertContains('patient', $draft['lowConfidence']);
    }

    public function test_a_name_nobody_has_is_a_new_patient_with_what_was_heard()
    {
        $draft = $this->certain(['patientName' => 'Zubair Ahmed', 'patientPhone' => '0301 7654321']);

        $this->assertNull($draft['patientId']);
        $this->assertSame('Zubair Ahmed', $draft['patientName']);
        $this->assertSame('+923017654321', $draft['phone']);
        $this->assertContains('patient', $draft['lowConfidence']);
    }

    public function test_no_name_and_no_number_leaves_the_patient_empty_and_flagged()
    {
        $draft = $this->resolve(['doctorName' => 'Sana', 'date' => '2026-11-02', 'time' => '10:00']);

        $this->assertNull($draft['patientId']);
        $this->assertSame('', $draft['patientName']);
        $this->assertContains('patient', $draft['lowConfidence']);
    }

    public function test_only_this_clinics_patients_are_ever_considered()
    {
        $other = Clinic::factory()->create();
        Patient::factory()->forClinic($other)->create(['name' => 'Bilal Hussain', 'phone' => '+923009998888']);

        $draft = $this->certain(['patientName' => 'Bilal Hussain', 'patientPhone' => '0300 9998888']);

        $this->assertNull($draft['patientId']);
        $this->assertSame('Bilal Hussain', $draft['patientName']);
    }

    // ---- doctor and service ----

    public function test_a_doctor_is_found_by_name_with_or_without_the_title_and_never_an_inactive_or_unknown_one()
    {
        $this->assertSame($this->doctor->id, $this->certain(['doctorName' => 'Dr. Sana'])['doctorId']);
        $this->assertSame($this->doctor->id, $this->certain(['doctorName' => 'سانا'])['doctorId'] ?? null, 'Urdu script for a short latin name is a guess, but a guess the card shows.');

        $unknown = $this->certain(['doctorName' => 'Nobody']);
        $this->assertNull($unknown['doctorId']);
        $this->assertContains('doctor', $unknown['lowConfidence']);

        $this->doctor->forceFill(['is_active' => false])->save();
        $this->assertNull($this->certain(['doctorName' => 'Sana'])['doctorId']);
    }

    public function test_with_no_doctor_named_the_only_doctor_is_offered_for_a_check_and_with_two_none_is()
    {
        $only = $this->certain(['doctorName' => null]);

        $this->assertSame($this->doctor->id, $only['doctorId']);
        $this->assertContains('doctor', $only['lowConfidence']);

        Doctor::factory()->forClinic($this->clinic)->create(['display_name' => 'Dr. Laith']);
        $two = $this->certain(['doctorName' => null]);

        $this->assertNull($two['doctorId']);
        $this->assertNull($two['startsAt'], 'Without a doctor there is no time to offer.');
        $this->assertContains('time', $two['lowConfidence']);
    }

    public function test_the_service_is_one_the_doctor_offers_and_a_single_offer_needs_no_check()
    {
        $single = $this->certain();

        $this->assertSame($this->service->id, $single['serviceId']);
        $this->assertNotContains('service', $single['lowConfidence']);

        $named = $this->certain(['serviceName' => 'checkup']);
        $this->assertSame($this->service->id, $named['serviceId']);
    }

    public function test_a_service_the_doctor_does_not_offer_is_not_chosen()
    {
        Service::factory()->forClinic($this->clinic)->create(['name' => 'Dental cleaning']);

        $draft = $this->certain(['serviceName' => 'dental cleaning']);

        $this->assertNull($draft['serviceId']);
        $this->assertContains('service', $draft['lowConfidence']);
        $this->assertNull($draft['startsAt']);
    }

    public function test_with_two_services_offered_and_none_named_the_service_is_left_for_the_person()
    {
        $second = Service::factory()->forClinic($this->clinic)->create(['name' => 'Follow-up', 'duration_minutes' => 20, 'buffer_minutes' => 0]);
        $this->doctor->services()->attach($second->id);

        $draft = $this->certain();

        $this->assertNull($draft['serviceId']);
        $this->assertContains('service', $draft['lowConfidence']);
        $this->assertSame($second->id, $this->certain(['serviceName' => 'follow up'])['serviceId']);
    }

    // ---- time ----

    public function test_a_time_that_is_offered_is_used_as_asked()
    {
        $draft = $this->certain(['time' => '14:30']);

        $this->assertSame('2026-11-02T09:30:00.000Z', $draft['startsAt']);
        $this->assertNotContains('time', $draft['lowConfidence']);
    }

    public function test_a_time_that_is_not_offered_becomes_the_nearest_free_one_and_says_so()
    {
        // 09:10 falls between the 30-minute steps; 09:00 is the nearest.
        $between = $this->certain(['time' => '09:10']);
        // The doctor does not work after 17:00; the nearest is the last slot of the day.
        $late = $this->certain(['time' => '19:00']);

        $this->assertSame('2026-11-02T04:00:00.000Z', $between['startsAt']);
        $this->assertContains('time', $between['lowConfidence']);
        $this->assertSame('2026-11-02T11:30:00.000Z', $late['startsAt']);
        $this->assertContains('time', $late['lowConfidence']);
    }

    public function test_a_taken_time_is_never_offered_back()
    {
        $this->occupy($this->doctor, '2026-11-02 10:00');

        $draft = $this->certain(['time' => '10:00']);

        $this->assertNotNull($draft['startsAt']);
        $this->assertNotSame('2026-11-02T05:00:00.000Z', $draft['startsAt']);
        $this->assertContains('time', $draft['lowConfidence']);
    }

    public function test_a_day_with_no_time_gets_that_days_first_free_slot_and_a_check()
    {
        $draft = $this->certain(['time' => null, 'date' => '2026-11-03']);

        $this->assertSame('2026-11-03T04:00:00.000Z', $draft['startsAt']);
        $this->assertContains('time', $draft['lowConfidence']);
    }

    public function test_no_day_and_no_time_gets_the_next_free_slot_and_a_check()
    {
        $draft = $this->certain(['time' => null, 'date' => null]);

        // Sunday is closed, so the next free slot is Monday morning.
        $this->assertSame('2026-11-02T04:00:00.000Z', $draft['startsAt']);
        $this->assertContains('time', $draft['lowConfidence']);
    }

    public function test_a_time_with_no_day_is_today_if_it_is_still_to_come_otherwise_tomorrow_and_either_way_is_checked()
    {
        // It is 15:00 in the clinic. 10:00 has passed, so it means tomorrow (a Monday, when the doctor works).
        $past = $this->certain(['date' => null, 'time' => '10:00']);
        $this->assertSame('2026-11-02T05:00:00.000Z', $past['startsAt']);
        $this->assertContains('time', $past['lowConfidence']);

        // 16:00 is still to come today, but the doctor does not work on Sunday: the nearest free time is offered instead.
        $coming = $this->certain(['date' => null, 'time' => '16:00']);
        $this->assertSame('2026-11-02T04:00:00.000Z', $coming['startsAt']);
        $this->assertContains('time', $coming['lowConfidence']);
    }

    public function test_a_doctor_with_no_free_time_at_all_gives_no_time_rather_than_a_wrong_one()
    {
        app(TenantContext::class)->run($this->clinic, fn () => ScheduleRule::query()->where('doctor_id', $this->doctor->id)->delete());

        $draft = $this->certain(['date' => '2026-11-02', 'time' => '10:00']);

        $this->assertNull($draft['startsAt']);
        $this->assertContains('time', $draft['lowConfidence']);
    }
}
