<?php

namespace App\Http\Requests\Booking;

use Illuminate\Foundation\Http\FormRequest;

/** `GET /api/availability` (a doctor, a service and a clinic-local date) and `GET /api/availability/alternatives` (a start and how many). */
class AvailabilityRequest extends FormRequest
{
    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        $rules = [
            'doctorId' => ['required', 'string', 'max:40'],
            'serviceId' => ['required', 'string', 'max:40'],
        ];

        if ($this->routeIs('api.availability.alternatives')) {
            $rules['startsAt'] = ['required', 'date'];
            $rules['count'] = ['sometimes', 'integer', 'between:1,10'];
        } else {
            $rules['date'] = ['required', 'date_format:Y-m-d'];
        }

        return $rules;
    }
}
