<?php

namespace App\Messaging\Channels;

use App\Messaging\Contracts\MessageChannel;
use App\Messaging\OutgoingMessage;
use Illuminate\Support\Facades\Log;

/**
 * Writes the message to the log and sends nothing. It is what SMS and WhatsApp use until a provider is chosen, so the whole flow can be
 * run and checked without sending anything to anyone. The log is where to read what a patient would have received.
 */
final class LogChannel implements MessageChannel
{
    public function send(OutgoingMessage $message): void
    {
        Log::info('Message to a patient (log driver, nothing was sent)', [
            'channel' => $message->channel,
            'to' => $message->to,
            'subject' => $message->subject,
            'body' => $message->body,
        ]);
    }
}
