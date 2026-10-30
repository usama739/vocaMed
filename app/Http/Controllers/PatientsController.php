<?php

namespace App\Http\Controllers;

use App\Authorization\Ability;
use App\Http\Requests\SavePatientRequest;
use App\Models\Clinic;
use App\Models\Patient;
use App\Services\PatientDirectory;
use App\Views\PatientView;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/** The clinic's patients, for the booking panel and the Patients page. JSON only; shared by the admin and the receptionist. */
class PatientsController extends Controller
{
    public function __construct(private readonly PatientDirectory $patients) {}

    /** Phone matches first, then names. */
    public function search(Request $request): JsonResponse
    {
        Gate::authorize(Ability::ManagePatients->value);

        $found = $this->patients->search((string) $request->query('q', ''), $this->limit($request, 10));

        return response()->json($found->map(fn (Patient $p) => PatientView::of($p))->all());
    }

    public function recent(Request $request): JsonResponse
    {
        Gate::authorize(Ability::ManagePatients->value);

        return response()->json($this->patients->recent($this->limit($request, 5))->map(fn (Patient $p) => PatientView::of($p))->all());
    }

    public function show(Patient $patient): JsonResponse
    {
        Gate::authorize(Ability::ManagePatients->value);

        return response()->json(PatientView::of($patient));
    }

    public function store(SavePatientRequest $request): JsonResponse
    {
        Gate::authorize(Ability::ManagePatients->value);

        return response()->json(PatientView::of($this->patients->create($this->clinic($request), $request->validated())), 201);
    }

    public function update(SavePatientRequest $request, Patient $patient): JsonResponse
    {
        Gate::authorize(Ability::ManagePatients->value);

        return response()->json(PatientView::of($this->patients->update($this->clinic($request), $patient, $request->validated())));
    }

    /** How many results the caller asked for, between 1 and 25. */
    private function limit(Request $request, int $default): int
    {
        return max(1, min(25, (int) $request->query('limit', $default)));
    }

    private function clinic(Request $request): Clinic
    {
        /** @var Clinic */
        return $request->user()->clinic;
    }
}
