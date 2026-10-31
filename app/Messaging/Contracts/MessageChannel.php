<?php

namespace App\Messaging\Contracts;

use App\Messaging\DeliveryFailed;
use App\Messaging\OutgoingMessage;

/**
 * How one message reaches one patient. A driver (mail, log, later an SMS or WhatsApp provider) implements this and nothing else:
 * choosing the wording, who gets it, when, and never sending twice is the messaging code's job, not the driver's.
 */
interface MessageChannel
{
    /**
     * Send the message. Throw DeliveryFailed when it can never be delivered (the number is not on WhatsApp, the address does not
     * exist); any other failure is treated as temporary and tried again later.
     *
     * @throws DeliveryFailed
     */
    public function send(OutgoingMessage $message): void;
}
