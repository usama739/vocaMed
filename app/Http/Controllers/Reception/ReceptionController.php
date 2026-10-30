<?php

namespace App\Http\Controllers\Reception;

use App\Authorization\Ability;
use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\Clinic;
use App\Models\Patient;
use App\Models\User;
use App\Views\Reception\AppointmentDetailView;
use App\Views\Reception\AppointmentsView;
use App\Views\Reception\CalendarView;
use App\Views\Reception\PatientDetailView;
use App\Views\Reception\PatientsView;
use App\Views\Reception\TodayView;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The receptionist's pages (B1 to B6). The page itself is the Inertia page; the same address asked for JSON answers with that
 * page's read model (`lib/data/views.ts`), already joined and with what the person may do (`allowed`) decided here.
 */
class ReceptionController extends Controller
{
    public function today(Request $request, TodayView $view): Response|JsonResponse
    {
        if (! $request->expectsJson()) {
            return Inertia::render('reception/today');
        }

        Gate::authorize(Ability::ViewAppointments->value);

        return response()->json($view->of($this->clinic($request), $this->user($request)));
    }

    public function appointments(Request $request, AppointmentsView $view): Response|JsonResponse
    {
        if (! $request->expectsJson()) {
            return Inertia::render('reception/appointments');
        }

        Gate::authorize(Ability::ViewAppointments->value);

        $params = $request->validate([
            'when' => ['sometimes', Rule::in(['any', 'today', 'next7', 'past7'])],
            'doctorId' => ['sometimes', 'string', 'max:40'],
            'status' => ['sometimes', Rule::in(['booked', 'confirmed', 'arrived', 'in_consultation', 'done', 'cancelled', 'no_show'])],
            'q' => ['sometimes', 'nullable', 'string', 'max:120'],
            'sort' => ['sometimes', Rule::in(['asc', 'desc'])],
            'page' => ['sometimes', 'integer', 'min:1'],
            'perPage' => ['sometimes', 'integer', 'between:1,100'],
        ]);

        return response()->json($view->of($this->clinic($request), $this->user($request), [
            'when' => $params['when'] ?? 'any',
            'sort' => $params['sort'] ?? 'asc',
            'page' => (int) ($params['page'] ?? 1),
            ...(isset($params['doctorId']) ? ['doctorId' => (string) $params['doctorId']] : []),
            ...(isset($params['status']) ? ['status' => (string) $params['status']] : []),
            ...(isset($params['q']) ? ['q' => (string) $params['q']] : []),
            ...(isset($params['perPage']) ? ['perPage' => (int) $params['perPage']] : []),
        ]));
    }

    public function appointment(Request $request, string $id, AppointmentDetailView $view): Response|JsonResponse
    {
        if (! $request->expectsJson()) {
            return Inertia::render('reception/appointment', ['id' => $id]);
        }

        Gate::authorize(Ability::ViewAppointments->value);

        return response()->json($view->of($this->clinic($request), $this->user($request), Appointment::query()->findOrFail($id)));
    }

    public function calendar(Request $request, CalendarView $view): Response|JsonResponse
    {
        if (! $request->expectsJson()) {
            return Inertia::render('reception/calendar');
        }

        Gate::authorize(Ability::ViewAppointments->value);

        $params = $request->validate([
            'view' => ['sometimes', Rule::in(['day', 'week', 'month'])],
            'date' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'doctorId' => ['sometimes', 'string', 'max:40'],
        ]);

        return response()->json($view->of($this->clinic($request), $this->user($request), [
            'view' => $params['view'] ?? 'day',
            'date' => $params['date'] ?? null,
            'doctorId' => $params['doctorId'] ?? 'all',
        ]));
    }

    public function patients(Request $request, PatientsView $view): Response|JsonResponse
    {
        if (! $request->expectsJson()) {
            return Inertia::render('reception/patients');
        }

        Gate::authorize(Ability::ManagePatients->value);

        $q = $request->validate(['q' => ['sometimes', 'nullable', 'string', 'max:120']])['q'] ?? '';

        return response()->json($view->of($this->clinic($request), (string) $q));
    }

    public function patient(Request $request, string $id, PatientDetailView $view): Response|JsonResponse
    {
        if (! $request->expectsJson()) {
            return Inertia::render('reception/patient', ['id' => $id]);
        }

        Gate::authorize(Ability::ManagePatients->value);

        return response()->json($view->of($this->clinic($request), $this->user($request), Patient::query()->findOrFail($id)));
    }

    private function clinic(Request $request): Clinic
    {
        /** @var Clinic */
        return $request->user()->clinic;
    }

    private function user(Request $request): User
    {
        /** @var User */
        return $request->user();
    }
}
