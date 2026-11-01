<?php

namespace App\Http\Middleware;

use App\Enums\Role;
use App\Models\Doctor;
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
     * The private channel this person's screens listen on for live updates (see routes/channels.php): the clinic's for
     * the admin and reception, their own for a doctor. Null when nobody is signed in or no channel applies.
     */
    private function liveChannel(Request $request): ?string
    {
        $user = $request->user();

        if ($user === null || $user->clinic_id === null) {
            return null;
        }

        if ($user->role === Role::Doctor) {
            $doctorId = Doctor::query()->where('clinic_id', $user->clinic_id)->where('user_id', $user->id)->value('id');

            return $doctorId === null ? null : "clinic.{$user->clinic_id}.doctor.{$doctorId}";
        }

        return "clinic.{$user->clinic_id}";
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
                'user' => $request->user()?->asSessionUser(),
                'clinic' => $this->clinic($request),
                'liveChannel' => $this->liveChannel($request),
            ],
            'sidebarOpen' => ! $request->hasCookie('sidebar_state') || $request->cookie('sidebar_state') === 'true',
        ];
    }
}
