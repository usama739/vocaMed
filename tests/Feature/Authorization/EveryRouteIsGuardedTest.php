<?php

namespace Tests\Feature\Authorization;

use App\Http\Middleware\EnsureStaffRole;
use Illuminate\Routing\Route;
use Illuminate\Support\Facades\Route as RouteFacade;
use Tests\TestCase;

/**
 * A new page cannot go live unguarded: every route is either on the public list below (with the reason) or carries the
 * staff guard. Adding a public route is a decision, so it is added here on purpose.
 */
class EveryRouteIsGuardedTest extends TestCase
{
    /**
     * URI prefixes that anyone may reach, and why.
     *
     * @var array<string, string>
     */
    private const PUBLIC = [
        '' => 'landing page',
        'up' => 'health check',
        'login' => 'sign-in (Fortify; signed-in people are sent away by the guest middleware)',
        'logout' => 'sign out (needs a session, checked by auth)',
        'register' => 'sign-up, behind its own switch and the emailed signed link',
        'forgot-password' => 'password reset request',
        'reset-password' => 'password reset (token)',
        'user/confirm' => 'Fortify password confirmation (needs a session)',
        'invitations' => 'invitation lookup and accept (the token is the credential)',
        'invite' => 'invitation page',
        'demo-requests' => 'request a demo',
        'privacy' => 'privacy page',
        'locale' => 'language switch',
        'p/' => 'patient link pages (the signed token is the credential)',
        'components' => 'developer preview, local only',
        'dev/' => 'developer inbox, local only',
        'storage' => 'framework file route',
        '_inertia' => 'Inertia developer tools, local only',
    ];

    private function isPublic(string $uri): bool
    {
        foreach (array_keys(self::PUBLIC) as $prefix) {
            if ($prefix === '' ? $uri === '/' : str_starts_with($uri, $prefix)) {
                return true;
            }
        }

        return false;
    }

    public function test_every_route_is_public_on_purpose_or_has_the_staff_guard()
    {
        $unguarded = [];

        /** @var Route $route */
        foreach (RouteFacade::getRoutes() as $route) {
            if ($this->isPublic($route->uri())) {
                continue;
            }

            $guarded = collect($route->gatherMiddleware())
                ->contains(fn ($middleware) => is_string($middleware) && str_starts_with($middleware, EnsureStaffRole::class));

            if (! $guarded) {
                $unguarded[] = implode('|', $route->methods()).' '.$route->uri();
            }
        }

        $this->assertSame([], $unguarded, "These routes are neither public on purpose nor guarded:\n".implode("\n", $unguarded));
    }

    public function test_the_public_list_has_no_route_under_a_staff_area()
    {
        foreach (['admin', 'doctor', 'reception', 'account'] as $area) {
            $this->assertFalse($this->isPublic($area), "$area must never be public.");
            $this->assertFalse($this->isPublic("$area/anything"), "$area/anything must never be public.");
        }
    }
}
