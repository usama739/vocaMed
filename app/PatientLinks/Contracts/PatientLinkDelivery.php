<?php

namespace App\PatientLinks\Contracts;

use App\Models\Appointment;

/** How a new link reaches the patient. Today it is only logged on a developer machine; the messages step binds the real channel. */
interface PatientLinkDelivery
{
    public function deliver(Appointment $appointment, string $url): void;
}
