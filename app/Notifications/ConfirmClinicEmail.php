<?php

namespace App\Notifications;

use App\Models\User;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\URL;

/**
 * The "confirm your address" email a clinic admin gets after signing up. The workspace opens only once
 * the link is followed, so nobody can start a clinic with an address that is not theirs.
 */
class ConfirmClinicEmail extends Notification
{
    /**
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(User $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Confirm your email address')
            ->greeting("Hello {$notifiable->name},")
            ->line('Thanks for opening your clinic on VocaMed. Confirm your email address to open your workspace.')
            ->action('Confirm email address', $this->url($notifiable))
            ->line('The link works for '.config('vocamed.confirmation_hours').' hours. If you did not sign up, you can ignore this email.');
    }

    public function url(User $user): string
    {
        return URL::temporarySignedRoute(
            'register.confirm',
            now()->addHours((int) config('vocamed.confirmation_hours')),
            ['user' => $user->id, 'hash' => sha1($user->email)],
        );
    }
}
