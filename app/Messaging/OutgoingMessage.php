<?php

namespace App\Messaging;

/** A message ready to go: who it is for (a phone number or an email address), its subject (email only) and its text. */
final class OutgoingMessage
{
    public function __construct(
        public readonly string $channel,
        public readonly string $to,
        public readonly string $subject,
        public readonly string $body,
    ) {}
}
