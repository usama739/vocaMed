<?php

namespace Tests\Feature\Authorization;

use App\Enums\Role;
use App\Models\Clinic;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Route;
use Illuminate\Support\Facades\Route as RouteFacade;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/** Every staff page against every role: who gets in, who is sent home, who is refused. */
class StaffAreaAccessTest extends TestCase
{
    use RefreshDatabase;

    /** Which role each area is for. `account` is for all of them. */
    private const AREAS = ['admin' => Role::ClinicAdmin, 'doctor' => Role::Doctor, 'reception' => Role::Receptionist];

    protected function setUp(): void
    {
        parent::setUp();

        config(['vocamed.real_auth' => true]);
    }

    /**
     * Every registered staff page, as [name, url, the role its area is for or null for any].
     *
     * @return list<array{0: string, 1: string, 2: Role|null}>
     */
    private function staffPages(): array
    {
        $pages = [];

        foreach ($this->staffRoutes() as [$name, $url, $areaRole, $methods]) {
            if (in_array('GET', $methods, true)) {
                $pages[] = [$name, $url, $areaRole];
            }
        }

        return $pages;
    }

    /**
     * Every registered staff route (pages and writes): [name, url, the role its area is for or null for any, methods].
     *
     * @return list<array{0: string, 1: string, 2: Role|null, 3: list<string>}>
     */
    private function staffRoutes(): array
    {
        $routes = [];

        /** @var Route $route */
        foreach (RouteFacade::getRoutes() as $route) {
            $name = (string) $route->getName();
            $area = str_contains($name, '.') ? explode('.', $name)[0] : $name;

            if ($name === 'account' || isset(self::AREAS[$area]) || ($area === 'account')) {
                $routes[] = [$name, route($name, array_fill_keys($route->parameterNames(), 'x')), self::AREAS[$area] ?? null, $route->methods()];
            }
        }

        return $routes;
    }

    #[DataProvider('roles')]
    public function test_every_write_in_another_roles_area_is_refused_before_it_does_anything(Role $role)
    {
        $user = $this->signedInAs($role);

        foreach ($this->staffRoutes() as [$name, $url, $areaRole, $methods]) {
            foreach (array_diff($methods, ['GET', 'HEAD']) as $method) {
                if ($areaRole !== null && $areaRole !== $role) {
                    $this->actingAs($user)->json($method, $url)->assertForbidden();
                }
            }
        }
    }

    public function test_every_write_needs_a_signed_in_person()
    {
        foreach ($this->staffRoutes() as [$name, $url, $areaRole, $methods]) {
            foreach (array_diff($methods, ['GET', 'HEAD']) as $method) {
                $this->json($method, $url)->assertUnauthorized();
            }
        }
    }

    /**
     * @return array<string, array{0: Role}>
     */
    public static function roles(): array
    {
        return array_combine(
            array_map(fn (Role $role) => $role->value, Role::cases()),
            array_map(fn (Role $role) => [$role], Role::cases()),
        );
    }

    private function signedInAs(Role $role): User
    {
        return User::factory()->forClinic(Clinic::factory()->create())->create(['role' => $role]);
    }

    public function test_the_route_table_has_all_four_areas()
    {
        $names = array_column($this->staffPages(), 0);

        $this->assertContains('account', $names);
        $this->assertNotEmpty(preg_grep('/^admin\./', $names));
        $this->assertNotEmpty(preg_grep('/^doctor\./', $names));
        $this->assertNotEmpty(preg_grep('/^reception\./', $names));
    }

    #[DataProvider('roles')]
    public function test_a_role_reaches_its_own_area_and_the_account_page(Role $role)
    {
        $user = $this->signedInAs($role);

        foreach ($this->staffPages() as [$name, $url, $areaRole]) {
            if ($areaRole === null || $areaRole === $role) {
                $this->actingAs($user)->get($url)->assertOk();
            }
        }
    }

    #[DataProvider('roles')]
    public function test_a_page_of_another_role_sends_the_person_to_their_own_area(Role $role)
    {
        $user = $this->signedInAs($role);

        foreach ($this->staffPages() as [$name, $url, $areaRole]) {
            if ($areaRole !== null && $areaRole !== $role) {
                $this->actingAs($user)->get($url)->assertRedirect($role->home());
            }
        }
    }

    #[DataProvider('roles')]
    public function test_a_json_request_to_another_roles_area_is_forbidden(Role $role)
    {
        $user = $this->signedInAs($role);

        foreach ($this->staffPages() as [$name, $url, $areaRole]) {
            if ($areaRole !== null && $areaRole !== $role) {
                $this->actingAs($user)->getJson($url)->assertForbidden()->assertJsonPath('code', 'FORBIDDEN');
            }
        }
    }

    public function test_nobody_signed_in_is_sent_to_the_sign_in_page_or_told_so()
    {
        foreach ($this->staffPages() as [$name, $url]) {
            $this->get($url)->assertRedirect(route('login'));
            $this->getJson($url)->assertUnauthorized()->assertJsonPath('code', 'UNAUTHENTICATED');
        }
    }

    public function test_a_deactivated_person_is_signed_out_rather_than_let_in()
    {
        $user = User::factory()->inactive()->forClinic(Clinic::factory()->create())->clinicAdmin()->create();

        $this->actingAs($user)->get('/admin')->assertRedirect(route('login'));
    }

    public function test_the_areas_are_open_while_real_sign_in_is_off_for_the_demo()
    {
        config(['vocamed.real_auth' => false]);

        foreach ($this->staffPages() as [$name, $url]) {
            $this->get($url)->assertOk();
        }
    }
}
