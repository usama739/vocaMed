<?php

namespace Tests\Feature\Authorization;

use App\Authorization\Ability;
use App\Authorization\OwnedByStaff;
use App\Enums\Role;
use App\Models\Clinic;
use App\Models\Invitation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Each role against each action, written out from the permission table in the backend specification. It is typed here
 * on purpose, separately from `Ability::access()`, so a slip in either one fails the build.
 */
class PermissionMatrixTest extends TestCase
{
    use RefreshDatabase;

    /** ability => [clinic admin, receptionist, doctor]; "own" is own records only. */
    private const TABLE = [
        'staff.manage' => ['all', 'none', 'none'],
        'clinic.manage' => ['all', 'none', 'none'],
        'audit.view' => ['all', 'none', 'none'],
        'appointments.book' => ['all', 'all', 'none'],
        'appointments.view' => ['all', 'all', 'own'],
        'patients.manage' => ['all', 'all', 'none'],
        'appointments.arrival' => ['all', 'all', 'none'],
        'appointments.consultation' => ['all', 'all', 'own'],
        'availability.edit' => ['all', 'none', 'own'],
        'requests.decide' => ['all', 'none', 'own'],
    ];

    private const ROLES = [Role::ClinicAdmin, Role::Receptionist, Role::Doctor];

    /**
     * @return array<string, array{0: Role, 1: string, 2: string}>
     */
    public static function cells(): array
    {
        $cells = [];

        foreach (self::TABLE as $ability => $row) {
            foreach (self::ROLES as $i => $role) {
                $cells["{$role->value} / {$ability}"] = [$role, $ability, $row[$i]];
            }
        }

        return $cells;
    }

    private function record(bool $ownedByTheAskingPerson): OwnedByStaff
    {
        return new class($ownedByTheAskingPerson) implements OwnedByStaff
        {
            public function __construct(private bool $owned) {}

            public function isOwnedBy(User $user): bool
            {
                return $this->owned;
            }
        };
    }

    public function test_the_table_in_this_test_covers_every_ability()
    {
        $this->assertEqualsCanonicalizing(
            array_map(fn (Ability $ability) => $ability->value, Ability::cases()),
            array_keys(self::TABLE),
            'Add the new ability to the permission table in this test (and to the specification).',
        );
    }

    #[DataProvider('cells')]
    public function test_each_role_gets_exactly_what_the_table_says(Role $role, string $ability, string $expected)
    {
        $user = User::factory()->forClinic(Clinic::factory()->create())->create(['role' => $role]);
        $gate = Gate::forUser($user);

        match ($expected) {
            'all' => $this->assertTrue($gate->allows($ability) && $gate->allows($ability, $this->record(false))),
            'own' => $this->assertTrue(
                $gate->allows($ability, $this->record(true))
                && $gate->denies($ability, $this->record(false))
                && $gate->denies($ability),
                'An "own only" ability must need a record and refuse one that is not theirs.',
            ),
            'none' => $this->assertTrue($gate->denies($ability) && $gate->denies($ability, $this->record(true))),
        };
    }

    #[DataProvider('cells')]
    public function test_a_deactivated_person_may_do_nothing(Role $role, string $ability)
    {
        $user = User::factory()->inactive()->forClinic(Clinic::factory()->create())->create(['role' => $role]);

        $this->assertTrue(Gate::forUser($user)->denies($ability, $this->record(true)));
    }

    public function test_only_the_clinic_admin_manages_staff_invitations_of_their_own_clinic()
    {
        $clinic = Clinic::factory()->create();
        $other = Clinic::factory()->create();
        $admin = User::factory()->clinicAdmin()->forClinic($clinic)->create();
        $reception = User::factory()->receptionist()->forClinic($clinic)->create();
        $foreignAdmin = User::factory()->clinicAdmin()->forClinic($other)->create();
        $invitation = Invitation::factory()->create(['clinic_id' => $clinic->id]);

        $this->assertTrue($admin->can('viewAny', Invitation::class));
        $this->assertTrue($admin->can('create', Invitation::class));
        $this->assertTrue($this->withoutTenant(fn () => $admin->can('view', $invitation)));
        $this->assertTrue($this->withoutTenant(fn () => $admin->can('delete', $invitation)));

        $this->assertFalse($reception->can('viewAny', Invitation::class));
        $this->assertFalse($reception->can('create', Invitation::class));
        $this->assertFalse($this->withoutTenant(fn () => $reception->can('view', $invitation)));

        // An admin of another clinic is an admin, but not of this invitation.
        $this->assertTrue($foreignAdmin->can('create', Invitation::class));
        $this->assertFalse($this->withoutTenant(fn () => $foreignAdmin->can('view', $invitation)));
        $this->assertFalse($this->withoutTenant(fn () => $foreignAdmin->can('delete', $invitation)));
    }

    public function test_clinic_setup_is_for_the_clinic_admin_of_that_clinic_only()
    {
        $clinic = Clinic::factory()->create();
        $other = Clinic::factory()->create();
        $admin = User::factory()->clinicAdmin()->forClinic($clinic)->create();
        $doctor = User::factory()->doctor()->forClinic($clinic)->create();
        $foreignAdmin = User::factory()->clinicAdmin()->forClinic($other)->create();

        $this->assertTrue($admin->can('view', $clinic));
        $this->assertTrue($admin->can('update', $clinic));
        $this->assertTrue($doctor->can('view', $clinic));
        $this->assertFalse($doctor->can('update', $clinic));
        $this->assertFalse($foreignAdmin->can('view', $clinic));
        $this->assertFalse($foreignAdmin->can('update', $clinic));
    }
}
