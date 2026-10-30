<?php

namespace App\Http\Controllers\Doctor;

use App\Authorization\Ability;
use App\Authorization\Access;
use App\Authorization\Permissions;
use App\Http\Controllers\Controller;
use App\Models\Clinic;
use App\Models\Doctor;
use App\Models\User;
use App\Support\ClinicClock;
use App\Views\ClinicView;
use App\Views\Doctor\OverviewView;
use App\Views\DoctorView;
use App\Views\Reception\CalendarView;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The doctor's pages (C1 Overview, C2 Schedule, C4 Requests, and the sidebar badge). The page itself is the Inertia page; the same
 * address asked for JSON answers with that page's read model. A doctor only ever reads their own appointments, and a login with no
 * doctor linked to it gets a 404.
 */
class PagesController extends Controller
{
    public function overview(Request $request, OverviewView $view): Response|JsonResponse
    {
        if (! $request->expectsJson()) {
            return Inertia::render('doctor/overview');
        }

        $doctor = $this->mine($request);

        return response()->json($view->of($this->clinic($request), $this->user($request), $doctor));
    }

    public function schedule(Request $request, CalendarView $view): Response|JsonResponse
    {
        if (! $request->expectsJson()) {
            return Inertia::render('doctor/schedule');
        }

        $doctor = $this->mine($request);
        $params = $request->validate([
            'view' => ['sometimes', Rule::in(['day', 'week'])],
            'date' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
        ]);

        return response()->json($view->of($this->clinic($request), $this->user($request), [
            'view' => $params['view'] ?? 'day',
            'date' => $params['date'] ?? null,
            'doctorId' => $doctor->id,
        ]));
    }

    /** Reschedule requests arrive with patient links; until then there are none to show. */
    public function requests(Request $request): Response|JsonResponse
    {
        if (! $request->expectsJson()) {
            return Inertia::render('doctor/requests');
        }

        $doctor = $this->mine($request);
        $clinic = $this->clinic($request);

        return response()->json([
            'clinic' => ClinicView::of($clinic),
            'today' => ClinicClock::for($clinic)->today(),
            'doctor' => DoctorView::of($doctor->loadMissing('services')),
            'pending' => [],
            'history' => [],
        ]);
    }

    /** The sidebar badge. It never fails the page around it, so it needs nothing beyond the area's own guard. */
    public function shell(): JsonResponse
    {
        return response()->json(['pendingRequests' => 0]);
    }

    /** The signed-in doctor's own record: 404 when no doctor is linked to this login, 403 when the role may not read appointments. */
    private function mine(Request $request): Doctor
    {
        abort_if(Permissions::access($this->user($request), Ability::ViewAppointments) === Access::None, 403);

        return Doctor::query()->with('services')->where('user_id', $this->user($request)->id)->firstOrFail();
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
