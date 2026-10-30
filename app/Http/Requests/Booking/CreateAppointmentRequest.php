<?php

namespace App\Http\Requests\Booking;

use App\Enums\BookingSource;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * `POST /api/appointments`: what the booking panel collects. The source is manual, walk-in or voice (a patient-link booking
 * has its own entry point). Whether the patient, doctor and service exist, and the time is bookable, is the engine's call.
 */
class CreateAppointmentRequest extends FormRequest
{
    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'patientId' => ['required', 'string', 'max:40'],
            'doctorId' => ['required', 'string', 'max:40'],
            'serviceId' => ['required', 'string', 'max:40'],
            'startsAt' => ['required', 'date'],
            'source' => ['sometimes', 'nullable', Rule::in([BookingSource::Manual->value, BookingSource::WalkIn->value, BookingSource::Voice->value])],
            'reason' => ['sometimes', 'nullable', 'string', 'max:500'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:1000'],
        ];
    }
}
