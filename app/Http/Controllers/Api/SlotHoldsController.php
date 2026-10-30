<?php

namespace App\Http\Controllers\Api;

use App\Authorization\Ability;
use App\Booking\BookingTargets;
use App\Booking\Contracts\SlotHolds;
use App\Booking\SlotHold;
use App\Booking\SlotService;
use App\Http\Controllers\Controller;
use App\Models\Clinic;
use App\Models\User;
use App\Support\ClinicClock;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/** The two-minute "I am booking this" marker a receptionist places while filling in the booking panel. */
class SlotHoldsController extends Controller
{
    public function __construct(
        private readonly SlotHolds $holds,
        private readonly SlotService $slots,
        private readonly BookingTargets $targets,
    ) {}

    /** Hold a slot. A person holds one at a time, so this replaces their previous hold. Refused with alternatives if it cannot be booked. */
    public function store(Request $request): JsonResponse
    {
        Gate::authorize(Ability::BookAppointments->value);

        $data = $request->validate([
            'doctorId' => ['required', 'string', 'max:40'],
            'serviceId' => ['required', 'string', 'max:40'],
            'startsAt' => ['required', 'date'],
        ]);

        [$doctor, $service] = $this->targets->resolve($data['doctorId'], $data['serviceId']);
        $startsAt = CarbonImmutable::parse($data['startsAt'])->utc();
        $clinic = $this->clinic($request);
        $user = $this->user($request);

        $this->slots->assertBookable($clinic, $doctor, $service, $startsAt, null, $user);

        return response()->json($this->holds->hold($clinic, $user, $doctor, $service, $startsAt)->toArray(), 201);
    }

    /** Release a hold of your own. */
    public function destroy(Request $request, string $holdId): JsonResponse
    {
        Gate::authorize(Ability::BookAppointments->value);

        $this->holds->release($this->clinic($request), $this->user($request), $holdId);

        return response()->json(['ok' => true]);
    }

    /** Every hold on a clinic-local date, for striping held cells on the calendar. */
    public function index(Request $request): JsonResponse
    {
        Gate::authorize(Ability::BookAppointments->value);

        $date = $request->validate(['date' => ['required', 'date_format:Y-m-d']])['date'];
        $clinic = $this->clinic($request);
        $clock = ClinicClock::for($clinic);

        return response()->json(array_values(array_map(
            fn (SlotHold $hold) => $hold->toArray(),
            array_filter($this->holds->active($clinic), fn (SlotHold $hold) => $clock->dateOf($hold->startsAt) === $date),
        )));
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
