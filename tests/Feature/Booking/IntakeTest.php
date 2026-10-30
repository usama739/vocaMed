<?php

namespace Tests\Feature\Booking;

use App\Booking\BookingIntakeManager;
use App\Booking\BookingRequest;
use App\Booking\BookingService;
use App\Booking\Contracts\IntakeDriver;
use App\Booking\Intake\TypedIntake;
use App\Enums\BookingSource;
use App\Exceptions\SlotUnavailable;
use App\Support\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use Tests\Concerns\BuildsBookingWorld;
use Tests\TestCase;

/**
 * The booking engine does not know how a booking was asked for. These tests are the proof: a second way of asking (standing in for
 * voice) is added without changing the engine, and produces the same appointment, guard and audit as typed entry.
 */
class IntakeTest extends TestCase
{
    use BuildsBookingWorld, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->buildBookingWorld();
    }

    protected function tearDown(): void
    {
        $this->tearDownBookingWorld();

        parent::tearDown();
    }

    public function test_typed_entry_is_the_default_way_and_turns_the_form_into_a_booking_request()
    {
        $driver = app(BookingIntakeManager::class)->driver();

        $this->assertInstanceOf(TypedIntake::class, $driver);

        $request = $driver->toRequest(['patientId' => 'p', 'doctorId' => 'd', 'serviceId' => 's', 'startsAt' => '2026-11-02T05:00:00+00:00', 'source' => 'walk_in', 'reason' => '  a visit ', 'notes' => '']);

        $this->assertSame(['p', 'd', 's'], [$request->patientId, $request->doctorId, $request->serviceId]);
        $this->assertTrue($request->startsAt->equalTo(CarbonImmutable::parse('2026-11-02 05:00:00', 'UTC')));
        $this->assertSame(BookingSource::WalkIn, $request->source);
        $this->assertTrue($request->isWalkIn());
        $this->assertSame('a visit', $request->reason);
        $this->assertNull($request->notes);
    }

    public function test_the_default_source_is_manual()
    {
        $request = app(BookingIntakeManager::class)->driver('typed')->toRequest(['patientId' => 'p', 'doctorId' => 'd', 'serviceId' => 's', 'startsAt' => '2026-11-02T05:00:00Z']);

        $this->assertSame(BookingSource::Manual, $request->source);
    }

    public function test_another_way_of_asking_plugs_in_and_books_through_the_same_engine()
    {
        $manager = app(BookingIntakeManager::class);

        // What a voice driver does: it has understood "book Ayesha with Dr. Sana tomorrow at ten" and resolved it to ids and a time.
        [$patientId, $doctorId, $serviceId] = [$this->patient->id, $this->doctor->id, $this->service->id];
        $manager->extend('voice', fn () => new class($patientId, $doctorId, $serviceId) implements IntakeDriver
        {
            public function __construct(private string $patient, private string $doctor, private string $service) {}

            public function toRequest(array $input): BookingRequest
            {
                return new BookingRequest($this->patient, $this->doctor, $this->service, CarbonImmutable::parse($input['transcript_time'])->utc(), BookingSource::Voice, 'Spoken request');
            }
        });
        config(['vocamed.booking_intake' => 'voice']);

        $request = $manager->driver()->toRequest(['transcript_time' => $this->at('2026-11-02 10:00')->toIso8601String()]);
        $appointment = app(TenantContext::class)->run($this->clinic, fn () => app(BookingService::class)->book($this->clinic, $this->reception, $request));

        $this->assertSame('voice', $appointment->source->value);
        $this->assertSame('booked', $appointment->status->value);
        $this->assertSame(8, DB::table('appointment_slots')->where('appointment_id', $appointment->id)->count());
        $this->assertSame(['source' => 'voice'], json_decode(DB::table('audit_logs')->where('action', 'appointment.created')->value('meta'), true));
    }

    public function test_a_second_way_of_asking_meets_the_same_guard()
    {
        $manager = app(BookingIntakeManager::class);
        [$patientId, $doctorId, $serviceId] = [$this->patient->id, $this->doctor->id, $this->service->id];
        $manager->extend('voice', fn () => new class($patientId, $doctorId, $serviceId) implements IntakeDriver
        {
            public function __construct(private string $patient, private string $doctor, private string $service) {}

            public function toRequest(array $input): BookingRequest
            {
                return new BookingRequest($this->patient, $this->doctor, $this->service, CarbonImmutable::parse($input['at'])->utc(), BookingSource::Voice);
            }
        });
        $when = $this->at('2026-11-02 10:00')->toIso8601String();

        $this->actingAs($this->reception)->postJson(route('api.appointments.store'), ['patientId' => $this->patient->id, 'doctorId' => $this->doctor->id, 'serviceId' => $this->service->id, 'startsAt' => $when])->assertCreated();

        $voiceRequest = $manager->driver('voice')->toRequest(['at' => $when]);

        $this->expectException(SlotUnavailable::class);
        app(TenantContext::class)->run($this->clinic, fn () => app(BookingService::class)->book($this->clinic, $this->reception, $voiceRequest));
    }

    public function test_an_unknown_way_of_asking_fails_loudly_instead_of_booking_silently()
    {
        config(['vocamed.booking_intake' => 'telepathy']);

        $this->expectException(InvalidArgumentException::class);

        app(BookingIntakeManager::class)->driver();
    }
}
