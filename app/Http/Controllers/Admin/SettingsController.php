<?php

namespace App\Http\Controllers\Admin;

use App\Authorization\Ability;
use App\Data\ClinicSettings;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\SaveSettingsRequest;
use App\Models\Clinic;
use App\Services\ClinicSettingsService;
use App\Views\Admin\SettingsView;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

/** D6: the clinic's details, hours, holidays, reminders and voice. */
class SettingsController extends Controller
{
    public function show(Request $request): Response|JsonResponse
    {
        // The page itself is guarded by the area's role middleware (and is the open demo while real sign-in is off);
        // the data it reads is what needs the ability.
        if (! $request->expectsJson()) {
            return Inertia::render('admin/settings');
        }

        Gate::authorize(Ability::ManageClinicSetup->value);

        return response()->json(SettingsView::of($this->clinic($request)));
    }

    public function update(SaveSettingsRequest $request, ClinicSettingsService $service): JsonResponse
    {
        Gate::authorize(Ability::ManageClinicSetup->value);

        $service->save(
            $this->clinic($request),
            $request->validated('clinic'),
            ClinicSettings::fromValidated($request->validated('settings')),
            array_values($request->validated('settings.holidays')),
        );

        return response()->json(['ok' => true]);
    }

    private function clinic(Request $request): Clinic
    {
        /** @var Clinic */
        return $request->user()->clinic;
    }
}
