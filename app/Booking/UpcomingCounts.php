<?php

namespace App\Booking;

use App\Enums\AppointmentStatus;
use App\Models\Appointment;

/** How many appointments each doctor still has to come (booked or confirmed, from now on): one grouped query. */
class UpcomingCounts
{
    /**
     * @param  list<string>  $doctorIds
     * @return array<string, int> doctor id => count (a doctor with none is simply absent)
     */
    public function forDoctors(array $doctorIds): array
    {
        if ($doctorIds === []) {
            return [];
        }

        return Appointment::query()
            ->whereIn('doctor_id', $doctorIds)
            ->whereIn('status', [AppointmentStatus::Booked->value, AppointmentStatus::Confirmed->value])
            ->where('starts_at', '>=', now())
            ->selectRaw('doctor_id, count(*) as total')
            ->groupBy('doctor_id')
            ->pluck('total', 'doctor_id')
            ->map(fn ($total) => (int) $total)
            ->all();
    }
}
