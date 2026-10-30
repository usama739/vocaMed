<?php

namespace Tests\Feature\Admin;

use App\Enums\Role;
use App\Models\Clinic;
use App\Models\User;
use App\Services\Audit;
use App\Support\AuditCategory;
use App\Support\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\AssertsShape;
use Tests\TestCase;

class AuditViewTest extends TestCase
{
    use AssertsShape, RefreshDatabase;

    private Clinic $clinic;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        config(['vocamed.real_auth' => true]);
        Carbon::setTestNow('2026-10-30 09:00:00');
        $this->clinic = Clinic::factory()->create(['timezone' => 'Asia/Karachi']);
        $this->admin = User::factory()->clinicAdmin()->forClinic($this->clinic)->create(['name' => 'Amina Alpha']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    /** Write an entry for a clinic, as someone, `$hoursAgo` hours before now. */
    private function entry(string $action, ?User $actor = null, array $meta = [], int $hoursAgo = 0, ?Clinic $clinic = null): void
    {
        $clinic ??= $this->clinic;
        $entry = app(TenantContext::class)->run($clinic, fn () => app(Audit::class)->record($action, null, $meta, $actor));
        DB::table('audit_logs')->where('id', $entry->id)->update(['created_at' => now()->subHours($hoursAgo)]);
    }

    private function audit(array $query = [], ?User $as = null)
    {
        return $this->actingAs($as ?? $this->admin)->getJson(route('admin.audit', $query));
    }

    public function test_the_read_model_has_the_shape_the_screen_is_tested_with()
    {
        $this->entry('settings.updated', $this->admin, ['section' => 'hours']);

        $this->assertSameShape($this->fixture('admin-audit-view'), $this->audit()->assertOk()->json());
    }

    public function test_entries_come_newest_first_with_who_did_them()
    {
        $this->entry('settings.updated', $this->admin, ['section' => 'hours'], hoursAgo: 3);
        $this->entry('service.created', $this->admin, ['name' => 'Check-up'], hoursAgo: 1);
        $this->entry('message.failed', null, [], hoursAgo: 2);

        $rows = $this->audit()->json('rows');

        $this->assertSame(['service.created', 'message.failed', 'settings.updated'], array_column($rows, 'action'));
        $this->assertSame(['kind' => 'user', 'name' => 'Amina Alpha'], $rows[0]['actor']);
        $this->assertSame(['kind' => 'system', 'name' => null], $rows[1]['actor']);
        $this->assertSame(['name' => 'Check-up'], $rows[0]['meta']);
        $this->assertSame('2026-10-30T08:00:00.000Z', $rows[0]['at']);
    }

    public function test_it_looks_back_one_seven_or_thirty_clinic_days()
    {
        $this->entry('settings.updated', $this->admin, [], hoursAgo: 0);
        $this->entry('settings.updated', $this->admin, [], hoursAgo: 24 * 3);
        $this->entry('settings.updated', $this->admin, [], hoursAgo: 24 * 20);
        $this->entry('settings.updated', $this->admin, [], hoursAgo: 24 * 40);

        $this->assertSame(1, $this->audit(['days' => 1])->json('total'));
        $this->assertSame(2, $this->audit(['days' => 7])->json('total'));
        $this->assertSame(3, $this->audit(['days' => 30])->json('total'));
        $this->assertSame(2, $this->audit()->json('total'), 'seven days is the default');
        $this->assertSame(2, $this->audit(['days' => 99])->json('total'), 'an unknown range falls back to seven days');
    }

    public function test_today_means_the_clinics_day_not_utc()
    {
        // 09:00 UTC is 14:00 in Karachi on the same date; 20:00 UTC the day before is 01:00 today in Karachi.
        $this->entry('settings.updated', $this->admin, [], hoursAgo: 13);
        $this->entry('settings.updated', $this->admin, [], hoursAgo: 16);

        $this->assertSame(1, $this->audit(['days' => 1])->json('total'));
    }

    public function test_it_can_be_narrowed_to_one_person()
    {
        $other = User::factory()->receptionist()->forClinic($this->clinic)->create(['name' => 'Bilal Beta']);
        $this->entry('auth.login', $this->admin);
        $this->entry('auth.login', $other);
        $this->entry('auth.login', $other);

        $this->assertSame(2, $this->audit(['userId' => (string) $other->id])->json('total'));
        $this->assertSame(1, $this->audit(['userId' => (string) $this->admin->id])->json('total'));
    }

    public function test_the_people_to_choose_from_are_those_who_appear_in_the_log_by_name()
    {
        $beta = User::factory()->receptionist()->forClinic($this->clinic)->create(['name' => 'Bilal Beta']);
        User::factory()->receptionist()->forClinic($this->clinic)->create(['name' => 'Never Did Anything']);
        $this->entry('auth.login', $beta);
        $this->entry('auth.login', $this->admin);

        $this->assertSame(['Amina Alpha', 'Bilal Beta'], array_column($this->audit()->json('users'), 'name'));
    }

    /**
     * @return array<string, array{0: string, 1: string}>
     */
    public static function actions(): array
    {
        return [
            'appointment.created' => ['appointment.created', 'booking'],
            'appointment.cancelled' => ['appointment.cancelled', 'cancel'],
            'auth.login' => ['auth.login', 'login'],
            'user.invited' => ['user.invited', 'invite'],
            'user.deactivated' => ['user.deactivated', 'invite'],
            'settings.updated' => ['settings.updated', 'settings'],
            'template.updated' => ['template.updated', 'settings'],
            'service.created' => ['service.created', 'settings'],
            'doctor.updated' => ['doctor.updated', 'settings'],
            'availability.updated' => ['availability.updated', 'settings'],
            'appointment.rescheduled' => ['appointment.rescheduled', 'edit'],
            'patient.updated' => ['patient.updated', 'edit'],
        ];
    }

    #[DataProvider('actions')]
    public function test_each_action_belongs_to_one_group_and_the_filter_finds_it_there_only(string $action, string $category)
    {
        $this->assertSame($category, AuditCategory::of($action));

        foreach ($this->all() as $every) {
            $this->entry($every);
        }

        $found = $this->audit(['category' => $category])->json('rows');

        $this->assertContains($action, array_column($found, 'action'));

        foreach ($found as $row) {
            $this->assertSame($category, $row['category'], "{$row['action']} should not be listed under $category");
        }

        foreach (AuditCategory::ALL as $other) {
            if ($other !== $category) {
                $this->assertNotContains($action, array_column($this->audit(['category' => $other])->json('rows'), 'action'));
            }
        }
    }

    /** @return list<string> */
    private function all(): array
    {
        return array_column(array_values(self::actions()), 0);
    }

    public function test_pages_hold_twenty_five_and_the_total_covers_all()
    {
        for ($i = 0; $i < 30; $i++) {
            $this->entry('settings.updated', $this->admin, ['n' => $i], hoursAgo: 0);
        }

        $first = $this->audit(['page' => 1])->json();
        $second = $this->audit(['page' => 2])->json();

        $this->assertSame(30, $first['total']);
        $this->assertSame(25, $first['perPage']);
        $this->assertCount(25, $first['rows']);
        $this->assertCount(5, $second['rows']);
        $this->assertSame(2, $second['page']);
        $this->assertSame([], array_intersect(array_column($first['rows'], 'id'), array_column($second['rows'], 'id')));
    }

    public function test_another_clinics_history_is_never_shown()
    {
        $other = Clinic::factory()->create();
        $otherAdmin = User::factory()->clinicAdmin()->forClinic($other)->create(['name' => 'Their Admin']);
        $this->entry('settings.updated', $otherAdmin, [], clinic: $other);
        $this->entry('auth.login', $this->admin);

        $view = $this->audit()->json();

        $this->assertSame(1, $view['total']);
        $this->assertSame(['auth.login'], array_column($view['rows'], 'action'));
        $this->assertSame(['Amina Alpha'], array_column($view['users'], 'name'));
        $this->assertSame(0, $this->audit(['userId' => (string) $otherAdmin->id])->json('total'));
    }

    public function test_only_the_clinic_admin_may_read_the_log()
    {
        foreach ([Role::Receptionist, Role::Doctor] as $role) {
            $user = User::factory()->forClinic($this->clinic)->create(['role' => $role]);

            $this->audit(as: $user)->assertForbidden();
        }
    }

    public function test_the_page_still_renders_for_a_browser()
    {
        $this->actingAs($this->admin)->get(route('admin.audit'))->assertOk()->assertInertia(fn ($page) => $page->component('admin/audit'));
    }
}
