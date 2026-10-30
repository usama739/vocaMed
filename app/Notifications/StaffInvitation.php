<?php

namespace App\Notifications;

use App\Enums\Role;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * The email that carries a staff or doctor sign-in invitation. The link is the credential: it works once, for seven
 * days, and the plain token is never stored (only its hash). Sent to an address that has no account yet.
 */
class StaffInvitation extends Notification
{
    public function __construct(
        private readonly string $clinicName,
        private readonly Role $role,
        private readonly string $url,
    ) {}

    /**
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $role = match ($this->role) {
            Role::ClinicAdmin => 'clinic admin',
            Role::Receptionist => 'receptionist',
            Role::Doctor => 'doctor',
        };

        return (new MailMessage)
            ->subject("You are invited to join {$this->clinicName} on VocaMed")
            ->greeting('Hello,')
            ->line("{$this->clinicName} has invited you to sign in to VocaMed as a {$role}.")
            ->action('Accept the invitation', $this->url)
            ->line('The link works once and stays valid for '.config('vocamed.invitation_days').' days. If you were not expecting this, you can ignore this email.');
    }
}
