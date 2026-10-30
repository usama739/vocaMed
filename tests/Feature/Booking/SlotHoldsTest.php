<?php

namespace Tests\Feature\Booking;

use App\Booking\Contracts\SlotHolds;
use App\Exceptions\SlotUnavailable;
use App\Models\Clinic;
use App\Models\User;
use App\Support\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\BuildsBookingWorld;
use Tests\TestCase;

class SlotHoldsTest extends TestCase
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
     * Holds behave the same on every cache store they may be kept in.
     *
     * @return array<string, array{0: string}>
     */
    public static function stores(): array
    {
        return ['array' => ['array'], 'database' => ['database']];
    }

    private function holds(string $store): SlotHolds
    {
        config(['vocamed.holds_store' => $store]);

        return app(SlotHolds::class);
    }

    private function hold(SlotHolds $holds, User $by, string $local, ?Clinic $clinic = null)
    {
        return $holds->hold($clinic ?? $this->clinic, $by, $this->doctor, $this->service, $this->at($local));
    }

    #[DataProvider('stores')]
    public function test_a_hold_lasts_two_minutes_and_covers_the_service_and_its_buffer(string $store)
    {
        $holds = $this->holds($store);
        $hold = $this->hold($holds, $this->reception, '2026-11-02 10:00');

        $this->assertSame('2026-11-01T10:02:00.000Z', $hold->toArray()['expiresAt']);
        $this->assertSame((string) $this->reception->id, $hold->heldBy);
        $this->assertCount(8, $hold->cells(), '30 minutes + 10 minutes buffer in 5-minute cells');
        $this->assertSame([$hold->toArray()], array_map(fn ($h) => $h->toArray(), $holds->active($this->clinic)));
    }

    #[DataProvider('stores')]
    public function test_a_person_holds_one_slot_at_a_time(string $store)
    {
        $holds = $this->holds($store);
        $this->hold($holds, $this->reception, '2026-11-02 10:00');
        $second = $this->hold($holds, $this->reception, '2026-11-02 11:00');

        $active = $holds->active($this->clinic);

        $this->assertCount(1, $active);
        $this->assertSame($second->id, $active[0]->id);
    }

    #[DataProvider('stores')]
    public function test_nobody_else_can_hold_what_overlaps_a_hold_but_a_slot_beside_it_is_fine(string $store)
    {
        $holds = $this->holds($store);
        $this->hold($holds, $this->reception, '2026-11-02 10:00');

        foreach (['2026-11-02 10:00', '2026-11-02 10:30', '2026-11-02 09:30'] as $overlapping) {
            try {
                $this->hold($holds, $this->admin, $overlapping);
                $this->fail("$overlapping overlaps the hold (its buffer included)");
            } catch (SlotUnavailable) {
                $this->addToAssertionCount(1);
            }
        }

        $this->hold($holds, $this->admin, '2026-11-02 11:00');
        $this->assertCount(2, $holds->active($this->clinic));
    }

    #[DataProvider('stores')]
    public function test_the_same_person_may_hold_the_same_slot_again_and_keeps_one_hold(string $store)
    {
        $holds = $this->holds($store);
        $this->hold($holds, $this->reception, '2026-11-02 10:00');
        $this->hold($holds, $this->reception, '2026-11-02 10:00');

        $this->assertCount(1, $holds->active($this->clinic));
    }

    #[DataProvider('stores')]
    public function test_a_hold_runs_out_and_then_the_slot_can_be_held_by_someone_else(string $store)
    {
        $holds = $this->holds($store);
        $this->hold($holds, $this->reception, '2026-11-02 10:00');

        Carbon::setTestNow(now()->addSeconds(119));
        $this->assertCount(1, $holds->active($this->clinic));

        Carbon::setTestNow(now()->addSeconds(2));
        $this->assertSame([], $holds->active($this->clinic));
        $this->hold($holds, $this->admin, '2026-11-02 10:00');
        $this->assertCount(1, $holds->active($this->clinic));
    }

    #[DataProvider('stores')]
    public function test_a_hold_can_be_released_only_by_its_holder(string $store)
    {
        $holds = $this->holds($store);
        $hold = $this->hold($holds, $this->reception, '2026-11-02 10:00');

        $holds->release($this->clinic, $this->admin, $hold->id);
        $this->assertCount(1, $holds->active($this->clinic), "someone else's release does nothing");

        $holds->release($this->clinic, $this->reception, $hold->id);
        $this->assertSame([], $holds->active($this->clinic));
    }

    #[DataProvider('stores')]
    public function test_releasing_for_a_person_drops_only_their_hold(string $store)
    {
        $holds = $this->holds($store);
        $this->hold($holds, $this->reception, '2026-11-02 10:00');
        $kept = $this->hold($holds, $this->admin, '2026-11-02 11:00');

        $holds->releaseFor($this->clinic, $this->reception);

        $this->assertSame([$kept->id], array_map(fn ($h) => $h->id, $holds->active($this->clinic)));
    }

    #[DataProvider('stores')]
    public function test_one_clinics_holds_never_show_in_another(string $store)
    {
        $holds = $this->holds($store);
        $this->hold($holds, $this->reception, '2026-11-02 10:00');

        $other = Clinic::factory()->create();

        $this->assertSame([], $holds->active($other));
    }

    public function test_the_store_is_a_setting_and_an_unknown_one_fails_loudly()
    {
        config(['vocamed.holds_store' => 'nonexistent']);

        $this->expectException(\InvalidArgumentException::class);

        app(TenantContext::class)->run($this->clinic, fn () => app(SlotHolds::class)->active($this->clinic));
    }
}
