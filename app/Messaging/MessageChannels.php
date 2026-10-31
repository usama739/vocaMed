<?php

namespace App\Messaging;

use App\Messaging\Channels\LogChannel;
use App\Messaging\Channels\MailChannel;
use App\Messaging\Contracts\MessageChannel;
use Illuminate\Contracts\Container\Container;
use InvalidArgumentException;

/**
 * Picks the driver that sends a patient's channel (email, sms or whatsapp), from `vocamed.messages.drivers`. Adding a provider is one
 * driver class here and one value in the config; nothing that files or renders a message changes.
 */
class MessageChannels
{
    public function __construct(private readonly Container $app) {}

    public function for(string $channel): MessageChannel
    {
        $driver = (string) config("vocamed.messages.drivers.$channel");

        return match ($driver) {
            'mail' => $this->app->make(MailChannel::class),
            'log' => $this->app->make(LogChannel::class),
            default => throw new InvalidArgumentException("No message driver \"$driver\" for the $channel channel."),
        };
    }
}
