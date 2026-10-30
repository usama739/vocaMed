<?php

namespace Tests\Feature\Booking;

use App\Booking\Cells;
use App\Booking\Contracts\SlotHolds;
use App\Booking\SlotService;
use App\Exceptions\SlotUnavailable;
use App\Models\ClinicHoliday;
use App\Models\Doctor;
use App\Support\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\BuildsBookingWorld;
use Tests\TestCase;

class SlotServiceTest extends TestCase
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

    /**
     * @return list<string> the clinic-local start times (HH:MM) of the day's slots
     */
    private function times(string $date, ?Doctor $doctor = null, ?string $ignore = null): array
    {
        return app(TenantContext::class)->run($this->clinic, fn () => array_map(
            fn ($slot) => $slot->startsAt->setTimezone('Asia/Karachi')->format('H:i'),
            app(SlotService::class)->slots($this->clinic, $doctor ?? $this->doctor, $this->service, $date, $ignore, $this->reception),
        ));
    }

    private function inClinic(callable $work): mixed
    {
        return app(TenantContext::class)->run($this->clinic, $work);
    }

    public function test_a_working_day_is_offered_in_service_length_steps()
    {
        $times = $this->times($this->monday);

        $this->assertCount(16, $times);
        $this->assertSame('09:00', $times[0]);
        $this->assertSame('09:30', $times[1]);
        $this->assertSame('16:30', end($times), 'the last slot ends exactly at closing time');
    }

    public function test_a_slot_carries_its_utc_start_and_end_and_is_free()
    {
        $slot = $this->inClinic(fn () => app(SlotService::class)->slots($this->clinic, $this->doctor, $this->service, $this->monday)[0]);

        $this->assertSame('2026-11-02T04:00:00.000Z', $slot->toArray()['startsAt']);
        $this->assertSame('2026-11-02T04:30:00.000Z', $slot->toArray()['endsAt']);
        $this->assertSame('free', $slot->toArray()['state']);
        $this->assertArrayNotHasKey('heldByMe', $slot->toArray());
    }

    public function test_a_day_the_doctor_does_not_work_has_no_slots()
    {
        $this->assertSame([], $this->times('2026-11-07'), 'Saturday: the clinic is open but the doctor is off');
        $this->assertSame([], $this->times('2026-11-08'), 'Sunday: the clinic is closed');
    }

    public function test_lunch_takes_out_one_to_two()
    {
        $this->workWeekdays($this->doctor, [1 => ['lunch' => true]]);

        $times = $this->times($this->monday);

        $this->assertCount(14, $times);
        $this->assertNotContains('13:00', $times);
        $this->assertNotContains('13:30', $times);
        $this->assertContains('12:30', $times);
        $this->assertContains('14:00', $times);
    }

    public function test_a_half_hour_the_doctor_keeps_closed_is_not_offered()
    {
        $this->workWeekdays($this->doctor, [], [], [['weekday' => 1, 'time' => '10:00']]);

        $times = $this->times($this->monday);

        $this->assertNotContains('10:00', $times);
        $this->assertContains('09:30', $times);
        $this->assertContains('10:30', $times);
    }

    public function test_the_clinics_business_hours_are_the_outer_limit()
    {
        $this->clinic->forceFill(['settings' => ['businessHours' => [['weekday' => 1, 'open' => '10:00', 'close' => '12:00']]]])->save();

        $this->assertSame(['10:00', '10:30', '11:00', '11:30'], $this->times($this->monday));
        $this->assertSame([], $this->times('2026-11-03'), 'a day missing from the business hours is closed');
    }

    public function test_a_clinic_holiday_and_the_doctors_leave_close_the_day()
    {
        $this->inClinic(fn () => (new ClinicHoliday)->forceFill(['date' => '2026-11-02', 'name' => 'Holiday'])->save());
        $this->workWeekdays($this->doctor, [], [['id' => null, 'startDate' => '2026-11-03', 'endDate' => '2026-11-04', 'reason' => '']]);

        $this->assertSame([], $this->times('2026-11-02'));
        $this->assertSame([], $this->times('2026-11-03'));
        $this->assertSame([], $this->times('2026-11-04'));
        $this->assertNotSame([], $this->times('2026-11-05'));
    }

    public function test_times_that_have_passed_are_not_offered()
    {
        Carbon::setTestNow($this->at('2026-11-02 10:15'));

        $times = $this->times($this->monday);

        $this->assertSame('10:30', $times[0]);
        $this->assertNotContains('10:00', $times);
    }

    public function test_a_booked_slot_takes_its_buffer_and_the_half_hour_before_it()
    {
        $this->occupy($this->doctor, '2026-11-02 10:00');

        $times = $this->times($this->monday);

        $this->assertNotContains('09:30', $times, 'a visit at 09:30 plus its buffer would run into the 10:00 visit');
        $this->assertNotContains('10:00', $times);
        $this->assertNotContains('10:30', $times, 'the 10:00 visit keeps its buffer until 10:40');
        $this->assertContains('09:00', $times);
        $this->assertContains('11:00', $times);
    }

    public function test_another_doctors_bookings_do_not_matter()
    {
        $other = Doctor::factory()->forClinic($this->clinic)->create();
        $other->services()->sync([$this->service->id]);
        $this->workWeekdays($other);
        $this->occupy($other, '2026-11-02 10:00');

        $this->assertContains('10:00', $this->times($this->monday));
        $this->assertNotContains('10:00', $this->times($this->monday, $other));
    }

    public function test_a_slot_can_ignore_one_appointments_own_time_for_moving_it()
    {
        $this->occupy($this->doctor, '2026-11-02 10:00');
        $appointmentId = DB::table('appointments')->value('id');

        $this->assertContains('10:00', $this->times($this->monday, null, $appointmentId));
    }

    public function test_longer_services_use_their_own_step_and_restart_after_lunch()
    {
        $this->service->forceFill(['duration_minutes' => 45, 'buffer_minutes' => 0])->save();
        $this->workWeekdays($this->doctor, [1 => ['lunch' => true]]);

        $times = $this->times($this->monday);

        $this->assertSame(['09:00', '09:45', '10:30', '11:15', '12:00'], array_slice($times, 0, 5));
        $this->assertNotContains('12:45', $times, 'it would run into lunch');
        $this->assertSame('14:00', $times[5], 'the afternoon starts again at 14:00');
        $this->assertSame('16:15', end($times));
    }

    public function test_a_held_slot_is_listed_as_held_and_is_the_holders_to_book()
    {
        $this->inClinic(fn () => app(SlotHolds::class)->hold($this->clinic, $this->reception, $this->doctor, $this->service, $this->at('2026-11-02 10:00')));

        $mine = $this->inClinic(fn () => collect(app(SlotService::class)->slots($this->clinic, $this->doctor, $this->service, $this->monday, null, $this->reception))->first(fn ($s) => $s->startsAt->equalTo($this->at('2026-11-02 10:00'))));
        $theirs = $this->inClinic(fn () => collect(app(SlotService::class)->slots($this->clinic, $this->doctor, $this->service, $this->monday, null, $this->admin))->first(fn ($s) => $s->startsAt->equalTo($this->at('2026-11-02 10:00'))));

        $this->assertSame(['state' => 'held', 'heldByMe' => true], array_intersect_key($mine->toArray(), array_flip(['state', 'heldByMe'])));
        $this->assertSame(['state' => 'held', 'heldByMe' => false], array_intersect_key($theirs->toArray(), array_flip(['state', 'heldByMe'])));
        $this->assertTrue($mine->isBookable());
        $this->assertFalse($theirs->isBookable());
    }

    public function test_asserting_bookable_passes_for_a_free_slot_and_refuses_with_alternatives_otherwise()
    {
        $service = app(SlotService::class);

        $this->inClinic(fn () => $service->assertBookable($this->clinic, $this->doctor, $this->service, $this->at('2026-11-02 11:00'), null, $this->reception));
        $this->addToAssertionCount(1);

        foreach (['2026-11-02 11:10', '2026-11-02 08:00', '2026-11-01 11:00', '2026-11-07 10:00'] as $bad) {
            try {
                $this->inClinic(fn () => $service->assertBookable($this->clinic, $this->doctor, $this->service, $this->at($bad), null, $this->reception));
                $this->fail("$bad should not be bookable");
            } catch (SlotUnavailable $e) {
                $this->assertSame('SLOT_UNAVAILABLE', $e->errorCode());
                $this->assertSame(409, $e->status());
                $this->assertCount(3, $e->extra()['alternatives']);
            }
        }
    }

    public function test_alternatives_are_the_nearest_bookable_slots_never_the_time_itself()
    {
        $this->occupy($this->doctor, '2026-11-02 10:00');

        $alternatives = $this->inClinic(fn () => app(SlotService::class)->alternatives($this->clinic, $this->doctor, $this->service, $this->at('2026-11-02 10:00'), 3, null, $this->reception));

        $this->assertSame(['09:00', '11:00', '11:30'], array_map(fn ($s) => $this->at('2026-11-02 00:00')->setTimezone('Asia/Karachi')->setTimeFrom(CarbonImmutable::parse($s['startsAt'])->setTimezone('Asia/Karachi'))->format('H:i'), $alternatives));
        $this->assertSame(['doctorId', 'endsAt', 'serviceId', 'startsAt', 'state'], collect(array_keys($alternatives[0]))->sort()->values()->all());
    }

    public function test_alternatives_reach_into_the_following_days_and_respect_the_count()
    {
        // Wednesday 16:30 is the last slot of the day; the nearest others are earlier that day, but ask for many.
        $alternatives = $this->inClinic(fn () => app(SlotService::class)->alternatives($this->clinic, $this->doctor, $this->service, $this->at('2026-11-06 16:30'), 40, null, $this->reception));

        $this->assertLessThanOrEqual(40, count($alternatives));
        $this->assertGreaterThan(16, count($alternatives), 'more than one day is searched');
        $this->assertCount(1, $this->inClinic(fn () => app(SlotService::class)->alternatives($this->clinic, $this->doctor, $this->service, $this->at('2026-11-02 10:00'), 1, null, $this->reception)));
    }

    public function test_next_free_is_the_first_slot_nobody_holds()
    {
        $this->inClinic(fn () => app(SlotHolds::class)->hold($this->clinic, $this->reception, $this->doctor, $this->service, $this->at('2026-11-02 09:00')));

        $next = $this->inClinic(fn () => app(SlotService::class)->nextFree($this->clinic, $this->doctor, $this->service));

        $this->assertSame('2026-11-02T05:00:00.000Z', $next?->toArray()['startsAt'], 'a hold keeps its buffer too, so 09:30 is not free either');
    }

    public function test_next_free_is_null_when_the_doctor_has_no_hours()
    {
        $nobody = Doctor::factory()->forClinic($this->clinic)->create();

        $this->assertNull($this->inClinic(fn () => app(SlotService::class)->nextFree($this->clinic, $nobody, $this->service)));
    }

    public function test_cells_are_five_minutes_named_by_their_utc_start()
    {
        $cells = Cells::between($this->at('2026-11-02 10:00'), $this->at('2026-11-02 10:20'));

        $this->assertSame(['2026-11-02 05:00:00', '2026-11-02 05:05:00', '2026-11-02 05:10:00', '2026-11-02 05:15:00'], $cells);
        $this->assertSame([], Cells::between($this->at('2026-11-02 10:00'), $this->at('2026-11-02 10:00')));
    }
}
