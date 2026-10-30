<?php

namespace Tests\Feature\Audit;

use App\Exceptions\NoTenantContext;
use App\Models\AuditLog;
use App\Models\Clinic;
use App\Models\User;
use App\Services\Audit;
use App\Support\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use LogicException;
use Tests\TestCase;

class AuditTest extends TestCase
{
    use RefreshDatabase;

    public function test_an_entry_belongs_to_the_clinic_acting_and_names_the_actor_and_subject()
    {
        $clinic = Clinic::factory()->create();
        $admin = User::factory()->clinicAdmin()->forClinic($clinic)->create();

        $entry = app(TenantContext::class)->run($clinic, fn () => app(Audit::class)->record('settings.updated', $clinic, ['section' => 'hours'], $admin));

        $this->assertSame($clinic->id, $entry->clinic_id);
        $this->assertSame('user', $entry->actor_type);
        $this->assertSame((string) $admin->id, $entry->actor_id);
        $this->assertSame('Clinic', $entry->subject_type);
        $this->assertSame($clinic->id, $entry->subject_id);
        $this->assertSame(['section' => 'hours'], $entry->meta);
    }

    public function test_with_nobody_signed_in_the_actor_is_the_system()
    {
        $clinic = Clinic::factory()->create();

        $entry = app(TenantContext::class)->run($clinic, fn () => app(Audit::class)->record('message.failed'));

        $this->assertSame('system', $entry->actor_type);
        $this->assertNull($entry->actor_id);
    }

    public function test_nothing_is_written_with_no_clinic()
    {
        $this->expectException(NoTenantContext::class);

        app(Audit::class)->record('settings.updated');
    }

    public function test_an_entry_can_never_be_changed_or_removed()
    {
        $clinic = Clinic::factory()->create();
        $entry = app(TenantContext::class)->run($clinic, fn () => app(Audit::class)->record('settings.updated'));

        try {
            $entry->forceFill(['action' => 'other'])->save();
            $this->fail('An audit entry was changed.');
        } catch (LogicException) {
        }

        try {
            $entry->delete();
            $this->fail('An audit entry was deleted.');
        } catch (LogicException) {
        }

        $this->assertSame('settings.updated', DB::table('audit_logs')->value('action'));
    }

    public function test_one_clinic_never_reads_anothers_history()
    {
        $a = Clinic::factory()->create();
        $b = Clinic::factory()->create();
        $tenant = app(TenantContext::class);
        $tenant->run($a, fn () => app(Audit::class)->record('settings.updated'));
        $tenant->run($b, fn () => app(Audit::class)->record('settings.updated'));
        $tenant->run($b, fn () => app(Audit::class)->record('doctor.created'));

        $this->assertSame(1, $tenant->run($a, fn () => AuditLog::query()->count()));
        $this->assertSame(2, $tenant->run($b, fn () => AuditLog::query()->count()));
    }

    public function test_signing_in_is_recorded_but_a_failed_attempt_is_not()
    {
        $clinic = Clinic::factory()->create();
        $admin = User::factory()->clinicAdmin()->forClinic($clinic)->create();

        $this->post(route('login.store'), ['email' => $admin->email, 'password' => 'wrong-password-1'], ['Accept' => 'application/json']);
        $this->assertSame(0, DB::table('audit_logs')->count());

        $this->post(route('login.store'), ['email' => $admin->email, 'password' => 'password'], ['Accept' => 'application/json'])->assertOk();

        $row = DB::table('audit_logs')->first();
        $this->assertSame('auth.login', $row->action);
        $this->assertSame($clinic->id, $row->clinic_id);
        $this->assertSame((string) $admin->id, $row->actor_id);
    }
}
