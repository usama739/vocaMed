<?php

namespace App\Http\Controllers\Admin;

use App\Authorization\Ability;
use App\Data\AvailabilityDraft;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\InviteRequest;
use App\Http\Requests\Admin\SaveDoctorRequest;
use App\Http\Requests\SaveAvailabilityRequest;
use App\Models\Clinic;
use App\Models\Doctor;
use App\Services\AvailabilityService;
use App\Services\DoctorCatalog;
use App\Services\StaffService;
use App\Views\Admin\DoctorProfileView;
use App\Views\Admin\DoctorsView;
use App\Views\DoctorView;
use App\Views\InvitationView;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

/** D2 and D3: the clinic's doctors, their profile, services and weekly availability. */
class DoctorsController extends Controller
{
    public function __construct(private readonly DoctorCatalog $doctors, private readonly AvailabilityService $availability) {}

    public function index(Request $request, DoctorsView $view): Response|JsonResponse
    {
        if (! $request->expectsJson()) {
            return Inertia::render('admin/doctors');
        }

        Gate::authorize(Ability::ManageClinicSetup->value);

        $status = in_array($request->query('status'), ['active', 'inactive'], true) ? (string) $request->query('status') : 'all';

        return response()->json($view->of($this->clinic($request), (string) $request->query('q', ''), $status));
    }

    /** `{id}` is a doctor's id, or `new` for the blank form. */
    public function show(Request $request, string $id, DoctorProfileView $view): Response|JsonResponse
    {
        if (! $request->expectsJson()) {
            return Inertia::render('admin/doctor', ['id' => $id]);
        }

        Gate::authorize(Ability::ManageClinicSetup->value);

        $doctor = $id === 'new' ? null : Doctor::query()->with('services', 'user')->findOrFail($id);

        return response()->json($view->of($this->clinic($request), $doctor));
    }

    public function store(SaveDoctorRequest $request): JsonResponse
    {
        Gate::authorize(Ability::ManageClinicSetup->value);

        $doctor = $this->doctors->create($request->validated('profile'), AvailabilityDraft::normalize($request->validated('availability')));

        return response()->json(DoctorView::of($doctor), 201);
    }

    public function update(SaveDoctorRequest $request, Doctor $doctor): JsonResponse
    {
        Gate::authorize(Ability::ManageClinicSetup->value);

        $doctor = $this->doctors->update($doctor, $request->validated('profile'), AvailabilityDraft::normalize($request->validated('availability')));

        return response()->json(DoctorView::of($doctor));
    }

    /** `PATCH`: show or hide the doctor in booking. */
    public function toggle(Request $request, Doctor $doctor): JsonResponse
    {
        Gate::authorize(Ability::ManageClinicSetup->value);

        $active = $request->validate(['active' => ['required', 'boolean']])['active'];

        return response()->json(DoctorView::of($this->doctors->setActive($doctor, (bool) $active)));
    }

    /** `POST /admin/doctors/{id}/invite`: sign-in access for this doctor (the invitation is linked to them). */
    public function invite(InviteRequest $request, Doctor $doctor, StaffService $staff): JsonResponse
    {
        Gate::authorize(Ability::ManageStaff->value);

        return response()->json(InvitationView::of($staff->inviteDoctor($this->clinic($request), $doctor, $request->string('email')->toString())), 201);
    }

    /** What an availability draft would produce for a doctor, or for `new`. Saves nothing. */
    public function preview(SaveAvailabilityRequest $request, string $doctorId): JsonResponse
    {
        Gate::authorize(Ability::ManageClinicSetup->value);

        $doctor = $doctorId === 'new' ? null : Doctor::query()->findOrFail($doctorId);

        return response()->json($this->availability->preview($this->clinic($request), AvailabilityDraft::normalize($request->validated()), $doctor));
    }

    public function saveAvailability(SaveAvailabilityRequest $request, Doctor $doctor): JsonResponse
    {
        Gate::authorize('availability.edit', $doctor);

        $this->doctors->saveAvailability($doctor, AvailabilityDraft::normalize($request->validated()));

        return response()->json(['ok' => true]);
    }

    private function clinic(Request $request): Clinic
    {
        /** @var Clinic */
        return $request->user()->clinic;
    }
}
