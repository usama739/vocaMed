<?php

namespace App\Listeners;

use App\Support\DevInbox;
use Illuminate\Notifications\AnonymousNotifiable;
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
        $to = $event->notifiable instanceof AnonymousNotifiable
            ? $event->notifiable->routeNotificationFor('mail')
            : ($event->notifiable->email ?? null);

        if ($mail instanceof MailMessage && is_string($to) && $to !== '') {
            DevInbox::record($to, $mail);
        }
    }
}
