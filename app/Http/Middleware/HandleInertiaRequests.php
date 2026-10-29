<?php

namespace App\Http\Middleware;

use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * The signed-in person as the shell shows them. Only what the pages need: never the password hash, the clinic
     * id or anything else on the model.
     *
     * @return array{id: string, name: string, email: string, role: string|null, locale: string}|null
     */
    private function user(Request $request): ?array
    {
        $user = $request->user();

        if ($user === null) {
            return null;
        }

        return [
            'id' => (string) $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role?->value,
            'locale' => $user->locale,
        ];
    }

    /**
     * The clinic the signed-in person works in, by name only (the sidebar shows it).
     *
     * @return array{name: string}|null
     */
    private function clinic(Request $request): ?array
    {
        $clinic = $request->user()?->clinic;

        return $clinic === null ? null : ['name' => $clinic->name];
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        return [
            ...parent::share($request),
            'name' => config('app.name'),
            'locale' => app()->getLocale(),
            'direction' => SetLocale::LOCALES[app()->getLocale()] ?? 'ltr',
            'auth' => [
                'user' => $this->user($request),
                'clinic' => $this->clinic($request),
            ],
            'sidebarOpen' => ! $request->hasCookie('sidebar_state') || $request->cookie('sidebar_state') === 'true',
        ];
    }
}
