<?php

namespace App\Listeners;

use App\Support\DevInbox;
use Illuminate\Notifications\Events\NotificationSent;
use Illuminate\Notifications\Messages\MailMessage;

/** Copies every email notification into the developer inbox. Registered on local machines only. */
class RecordDevMail
{
    public function handle(NotificationSent $event): void
    {
        if ($event->channel !== 'mail' || ! method_exists($event->notification, 'toMail')) {
            return;
        }

        $mail = $event->notification->toMail($event->notifiable);

        if ($mail instanceof MailMessage && isset($event->notifiable->email)) {
            DevInbox::record((string) $event->notifiable->email, $mail);
        }
    }
}
