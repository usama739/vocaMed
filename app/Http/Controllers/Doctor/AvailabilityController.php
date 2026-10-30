<?php

namespace App\Http\Controllers\Doctor;

use App\Data\AvailabilityDraft;
use App\Http\Controllers\Controller;
use App\Http\Requests\SaveAvailabilityRequest;
use App\Models\Clinic;
use App\Models\Doctor;
use App\Services\AvailabilityService;
use App\Services\DoctorCatalog;
use App\Views\AvailabilityView;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

/** C3: a doctor's own weekly hours, leave and closed half hours. A doctor reaches only their own. */
class AvailabilityController extends Controller
{
    public function show(Request $request, AvailabilityView $view): Response|JsonResponse
    {
        if (! $request->expectsJson()) {
            return Inertia::render('doctor/availability');
        }

        $doctor = $this->mine($request);

        return response()->json($view->of($this->clinic($request), $doctor));
    }

    public function save(SaveAvailabilityRequest $request, DoctorCatalog $doctors): JsonResponse
    {
        $doctors->saveAvailability($this->mine($request), AvailabilityDraft::normalize($request->validated()));

        return response()->json(['ok' => true]);
    }

    public function preview(SaveAvailabilityRequest $request, AvailabilityService $availability): JsonResponse
    {
        return response()->json($availability->preview($this->clinic($request), AvailabilityDraft::normalize($request->validated()), $this->mine($request)));
    }

    /** The signed-in doctor's own record, or 404 when no doctor is linked to this login. */
    private function mine(Request $request): Doctor
    {
        $doctor = Doctor::query()->with('services')->where('user_id', $request->user()?->id)->firstOrFail();

        Gate::authorize('availability.edit', $doctor);

        return $doctor;
    }

    private function clinic(Request $request): Clinic
    {
        /** @var Clinic */
        return $request->user()->clinic;
    }
}
