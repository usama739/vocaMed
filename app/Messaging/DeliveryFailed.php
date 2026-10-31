<?php

namespace App\Messaging;

use RuntimeException;

/** A message that can never be delivered, with the reason the Notifications page shows (`unreachable`, `not_on_whatsapp`). */
class DeliveryFailed extends RuntimeException
{
    public function __construct(public readonly string $reason = 'unreachable', string $message = 'The message could not be delivered.')
    {
        parent::__construct($message);
    }
}
