<?php

namespace App\Http\Controllers\Api;

use App\Authorization\Ability;
use App\Booking\BookingTargets;
use App\Booking\SlotService;
use App\Http\Controllers\Controller;
use App\Http\Requests\Booking\AvailabilityRequest;
use App\Models\Clinic;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;

/** When a doctor can be booked for a service: a day's slots, and the nearest alternatives to a time. */
class AvailabilityController extends Controller
{
    public function __construct(private readonly SlotService $slots, private readonly BookingTargets $targets) {}

    /** The slots of one clinic-local date. Held slots are listed as held (and as the caller's own when they hold them). */
    public function index(AvailabilityRequest $request): JsonResponse
    {
        Gate::authorize(Ability::BookAppointments->value);

        [$doctor, $service] = $this->targets->resolve($request->string('doctorId')->toString(), $request->string('serviceId')->toString());

        $slots = $this->slots->slots($this->clinic($request), $doctor, $service, $request->string('date')->toString(), null, $this->user($request));

        return response()->json(array_map(fn ($slot) => $slot->toArray(), $slots));
    }

    public function alternatives(AvailabilityRequest $request): JsonResponse
    {
        Gate::authorize(Ability::BookAppointments->value);

        [$doctor, $service] = $this->targets->resolve($request->string('doctorId')->toString(), $request->string('serviceId')->toString());

        return response()->json($this->slots->alternatives(
            $this->clinic($request),
            $doctor,
            $service,
            CarbonImmutable::parse($request->string('startsAt')->toString())->utc(),
            (int) $request->integer('count', 3),
            null,
            $this->user($request),
        ));
    }

    private function clinic(AvailabilityRequest $request): Clinic
    {
        /** @var Clinic */
        return $request->user()->clinic;
    }

    private function user(AvailabilityRequest $request): User
    {
        /** @var User */
        return $request->user();
    }
}
