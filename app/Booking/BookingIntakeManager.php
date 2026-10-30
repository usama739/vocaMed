<?php

namespace App\Booking;

use App\Booking\Contracts\IntakeDriver;
use App\Booking\Intake\TypedIntake;
use Illuminate\Support\Manager;

/**
 * The way bookings are requested, chosen by `vocamed.booking_intake`: Laravel's driver ("manager") pattern, the same as mail
 * and cache drivers. `typed` is the booking panel. To add voice: write a driver that turns a reviewed transcript into a
 * BookingRequest, add a `createVoiceDriver()` here, and call `driver('voice')` from the voice endpoint. The engine is untouched.
 */
class BookingIntakeManager extends Manager
{
    public function getDefaultDriver(): string
    {
        return (string) $this->config->get('vocamed.booking_intake', 'typed');
    }

    public function createTypedDriver(): IntakeDriver
    {
        return $this->container->make(TypedIntake::class);
    }
}
