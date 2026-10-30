<?php

namespace App\Http\Controllers\Api;

use App\Authorization\Ability;
use App\Authorization\Access;
use App\Authorization\Permissions;
use App\Booking\SlotService;
use App\Http\Controllers\Controller;
use App\Models\Clinic;
use App\Models\Doctor;
use App\Models\Service;
use App\Models\User;
use App\Views\Admin\SettingsView;
use App\Views\DoctorView;
use App\Views\Reception\DoctorAvailabilityView;
use App\Views\ServiceView;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * What every staff screen needs to show names and options: the clinic and its settings, the doctors, the services, a doctor's
 * hours and their next free slot. Read-only, and open to anyone who may see appointments (every staff role).
 */
class LookupsController extends Controller
{
    public function clinic(Request $request): JsonResponse
    {
        $this->mayRead($request);

        return response()->json(SettingsView::of($this->clinicOf($request)));
    }

    public function doctors(Request $request): JsonResponse
    {
        $this->mayRead($request);

        $query = Doctor::query()->with('services')->orderBy('display_name');
        $request->boolean('activeOnly') && $query->where('is_active', true);

        return response()->json($query->get()->map(fn (Doctor $d) => DoctorView::of($d))->all());
    }

    public function doctor(Request $request, Doctor $doctor): JsonResponse
    {
        $this->mayRead($request);

        return response()->json(DoctorView::of($doctor->loadMissing('services')));
    }

    public function availability(Request $request, Doctor $doctor, DoctorAvailabilityView $view): JsonResponse
    {
        $this->mayRead($request);

        return response()->json($view->of($doctor));
    }

    /** `{slot}`: the first free slot for the service, or `null` when there is none (or the doctor cannot be booked for it). */
    public function nextFree(Request $request, Doctor $doctor, SlotService $slots): JsonResponse
    {
        $this->mayRead($request);

        $service = Service::query()->find($request->validate(['serviceId' => ['required', 'string', 'max:40']])['serviceId']);

        $bookable = $service instanceof Service && $service->is_active && $doctor->is_active
            && $doctor->services()->whereKey($service->id)->exists();

        return response()->json([
            'slot' => $bookable ? $slots->nextFree($this->clinicOf($request), $doctor, $service)?->toArray() : null,
        ]);
    }

    public function services(Request $request): JsonResponse
    {
        $this->mayRead($request);

        $services = Service::query()->get()->sortBy('name')->values();
        $request->boolean('activeOnly') && $services = $services->where('is_active', true)->values();

        return response()->json($services->map(fn (Service $s) => ServiceView::of($s))->all());
    }

    private function mayRead(Request $request): void
    {
        /** @var User $user */
        $user = $request->user();

        abort_if(Permissions::access($user, Ability::ViewAppointments) === Access::None, 403);
    }

    private function clinicOf(Request $request): Clinic
    {
        /** @var Clinic */
        return $request->user()->clinic;
    }
}
