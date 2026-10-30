<?php

namespace App\Http\Controllers\Api;

use App\Authorization\Ability;
use App\Authorization\Access;
use App\Authorization\Permissions;
use App\Booking\BookingIntakeManager;
use App\Booking\BookingService;
use App\Enums\AppointmentStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Booking\CreateAppointmentRequest;
use App\Models\Appointment;
use App\Models\Clinic;
use App\Models\User;
use App\Services\AppointmentSearch;
use App\Views\AppointmentView;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/** Booking, moving, cancelling and taking appointments through their day, and reading them back. */
class AppointmentsController extends Controller
{
    public function __construct(
        private readonly BookingService $booking,
        private readonly BookingIntakeManager $intake,
        private readonly AppointmentSearch $search,
    ) {}

    /** Book. The panel's typed entry is turned into a booking request by the configured intake driver. */
    public function store(CreateAppointmentRequest $request): JsonResponse
    {
        Gate::authorize('create', Appointment::class);

        $appointment = $this->booking->book(
            $this->clinic($request),
            $this->user($request),
            $this->intake->driver()->toRequest($request->validated()),
        );

        return response()->json(AppointmentView::of($appointment), 201);
    }

    public function show(Appointment $appointment): JsonResponse
    {
        Gate::authorize('view', $appointment);

        return response()->json(AppointmentView::of($appointment));
    }

    /**
     * A page of appointments: filtered by clinic-local dates, doctor, patient, status or the patient's name or phone. A doctor
     * only ever gets their own.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $this->user($request);
        $access = Permissions::access($user, Ability::ViewAppointments);

        abort_if($access === Access::None, 403);

        $filters = $request->validate([
            'from' => ['sometimes', 'date_format:Y-m-d'],
            'to' => ['sometimes', 'date_format:Y-m-d'],
            'doctorId' => ['sometimes', 'string', 'max:40'],
            'patientId' => ['sometimes', 'string', 'max:40'],
            'status' => ['sometimes', Rule::enum(AppointmentStatus::class)],
            'patient' => ['sometimes', 'string', 'max:120'],
            'sort' => ['sometimes', Rule::in(['startsAt', '-startsAt'])],
            'page' => ['sometimes', 'integer', 'min:1'],
            'perPage' => ['sometimes', 'integer', 'between:1,100'],
        ]);

        $result = $this->search->page($this->clinic($request), $filters, $access === Access::Own ? $user : null);

        return response()->json([
            'items' => $result['items']->map(fn (Appointment $a) => AppointmentView::of($a))->all(),
            'total' => $result['total'],
            'page' => $result['page'],
            'perPage' => $result['perPage'],
        ]);
    }

    public function reschedule(Request $request, Appointment $appointment): JsonResponse
    {
        Gate::authorize('reschedule', $appointment);

        $startsAt = $request->validate(['startsAt' => ['required', 'date']])['startsAt'];

        return response()->json(AppointmentView::of($this->booking->reschedule(
            $this->clinic($request),
            $this->user($request),
            $appointment,
            CarbonImmutable::parse($startsAt)->utc(),
        )));
    }

    public function cancel(Appointment $appointment): JsonResponse
    {
        Gate::authorize('cancel', $appointment);

        return response()->json(AppointmentView::of($this->booking->cancel($appointment)));
    }

    /** `{status}` moves the appointment to another stage; `{undo: true}` steps the stage back (same day only). */
    public function status(Request $request, Appointment $appointment): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required_without:undo', Rule::enum(AppointmentStatus::class)],
            'undo' => ['sometimes', 'boolean'],
        ]);

        if ($request->boolean('undo')) {
            Gate::authorize('undo', $appointment);

            return response()->json(AppointmentView::of($this->booking->undo($this->clinic($request), $appointment)));
        }

        $to = AppointmentStatus::from($data['status']);
        Gate::authorize('changeStatus', [$appointment, $to]);

        return response()->json(AppointmentView::of($this->booking->setStatus($appointment, $to)));
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
