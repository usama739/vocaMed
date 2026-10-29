<?php

namespace Tests\Feature\Tenancy;

use App\Enums\ClinicStatus;
use App\Exceptions\NoTenantContext;
use App\Jobs\Middleware\RunInClinic;
use App\Models\Clinic;
use App\Models\Invitation;
use App\Models\User;
use App\Support\TenantContext;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class TenantContextTest extends TestCase
{
    use RefreshDatabase;

    private TenantContext $tenant;

    private Clinic $a;

    private Clinic $b;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = app(TenantContext::class);
        $this->a = Clinic::factory()->create(['name' => 'Clinic A']);
        $this->b = Clinic::factory()->create(['name' => 'Clinic B']);
        Invitation::factory()->create(['clinic_id' => $this->a->id, 'email' => 'a1@example.test']);
        Invitation::factory()->create(['clinic_id' => $this->a->id, 'email' => 'a2@example.test']);
        Invitation::factory()->create(['clinic_id' => $this->b->id, 'email' => 'b1@example.test']);
    }

    public function test_a_clinic_table_cannot_be_read_with_no_clinic_set()
    {
        $this->expectException(NoTenantContext::class);

        Invitation::query()->count();
    }

    public function test_queries_see_only_the_clinic_being_acted_for()
    {
        $this->assertSame(
            ['a1@example.test', 'a2@example.test'],
            $this->tenant->run($this->a, fn () => Invitation::query()->orderBy('email')->pluck('email')->all()),
        );
        $this->assertSame(
            ['b1@example.test'],
            $this->tenant->run($this->b, fn () => Invitation::query()->pluck('email')->all()),
        );
    }

    public function test_another_clinics_record_is_not_found_even_by_its_id()
    {
        $foreign = $this->withoutTenant(fn () => Invitation::query()->where('email', 'b1@example.test')->firstOrFail());

        $this->assertNull($this->tenant->run($this->a, fn () => Invitation::query()->find($foreign->id)));
        $this->assertSame(0, $this->tenant->run($this->a, fn () => Invitation::query()->whereKey($foreign->id)->count()));
    }

    public function test_run_puts_back_what_was_set_before_even_when_it_fails()
    {
        $this->tenant->set($this->a);

        try {
            $this->tenant->run($this->b, fn () => throw new RuntimeException('boom'));
        } catch (RuntimeException) {
        }

        $this->assertSame($this->a->id, $this->tenant->id());
        $this->assertSame($this->b->id, $this->tenant->run($this->b, fn () => $this->tenant->run($this->b, fn () => $this->tenant->id())));
        $this->assertSame($this->a->id, $this->tenant->id());
    }

    public function test_bypass_reads_every_clinic_and_a_clinic_run_inside_it_is_limited_again()
    {
        $this->assertSame(3, $this->tenant->bypass(fn () => Invitation::query()->count()));
        $this->assertSame(1, $this->tenant->bypass(fn () => $this->tenant->run($this->b, fn () => Invitation::query()->count())));
        $this->assertFalse($this->tenant->bypassed());
    }

    public function test_a_new_row_takes_the_clinic_being_acted_for()
    {
        $invitation = $this->tenant->run($this->b, fn () => Invitation::factory()->make(['clinic_id' => null, 'email' => 'new@example.test']));
        $this->tenant->run($this->b, fn () => $invitation->save());

        $this->assertSame($this->b->id, $invitation->clinic_id);
    }

    public function test_a_new_row_with_no_clinic_at_all_is_refused()
    {
        $this->expectException(NoTenantContext::class);

        Invitation::factory()->make(['clinic_id' => null])->save();
    }

    public function test_a_row_cannot_be_written_for_another_clinic()
    {
        $this->expectException(NoTenantContext::class);

        $this->tenant->run($this->a, fn () => Invitation::factory()->create(['clinic_id' => $this->b->id]));
    }

    public function test_a_row_cannot_be_moved_to_another_clinic()
    {
        $invitation = $this->tenant->run($this->a, fn () => Invitation::query()->firstOrFail());

        $this->expectException(NoTenantContext::class);

        $this->tenant->run($this->a, function () use ($invitation) {
            $invitation->clinic_id = $this->b->id;
            $invitation->save();
        });
    }

    public function test_each_clinic_runs_the_callback_as_that_clinic_and_skips_suspended_ones()
    {
        $suspended = Clinic::factory()->create(['status' => ClinicStatus::Suspended]);
        $seen = [];

        $this->tenant->eachClinic(function (Clinic $clinic) use (&$seen) {
            $seen[$clinic->id] = [$this->tenant->id(), Invitation::query()->count()];
        });

        $this->assertEqualsCanonicalizing([$this->a->id, $this->b->id], array_keys($seen));
        $this->assertArrayNotHasKey($suspended->id, $seen);
        $this->assertSame([$this->a->id, 2], $seen[$this->a->id]);
        $this->assertSame([$this->b->id, 1], $seen[$this->b->id]);
        $this->assertNull($this->tenant->id());
    }

    public function test_a_job_runs_in_the_clinic_it_carries()
    {
        $job = new class($this->b->id)
        {
            public function __construct(public string $clinicId) {}
        };

        $seen = (new RunInClinic)->handle($job, fn () => [app(TenantContext::class)->id(), Invitation::query()->count()]);

        $this->assertSame([$this->b->id, 1], $seen);
        $this->assertNull($this->tenant->id());
    }

    public function test_a_job_with_no_clinic_fails_instead_of_running_unscoped()
    {
        $this->expectException(\LogicException::class);

        (new RunInClinic)->handle(new class {}, fn () => 'ran');
    }

    public function test_a_job_for_a_missing_clinic_fails()
    {
        $this->expectException(ModelNotFoundException::class);

        (new RunInClinic)->handle(new class
        {
            public string $clinicId = 'does-not-exist';
        }, fn () => 'ran');
    }

    public function test_the_staff_list_is_limited_to_the_clinic_and_needs_one()
    {
        User::factory()->clinicAdmin()->forClinic($this->a)->create(['email' => 'admin-a@example.test']);
        User::factory()->doctor()->forClinic($this->b)->create(['email' => 'doc-b@example.test']);

        $this->assertSame(
            ['admin-a@example.test'],
            $this->tenant->run($this->a, fn () => User::query()->inCurrentClinic()->pluck('email')->all()),
        );

        $this->expectException(NoTenantContext::class);

        User::query()->inCurrentClinic()->get();
    }
}
