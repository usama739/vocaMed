<?php

namespace App\PatientLinks;

use App\Models\Appointment;
use App\PatientLinks\Contracts\PatientLinkDelivery;
use Illuminate\Support\Facades\Log;

/** Writes the new link to the log on a developer machine (never in production) so it can be opened by hand. Nothing is sent. */
final class LogPatientLinkDelivery implements PatientLinkDelivery
{
    public function deliver(Appointment $appointment, string $url): void
    {
        if (app()->environment(['local', 'testing'])) {
            Log::info('Patient link issued', ['appointment' => $appointment->id, 'url' => $url]);
        }
    }
}
