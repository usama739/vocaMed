<?php

namespace App\Notifications;

use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;

/** Laravel's own "reset your password" email, sent through the queue so a slow mail server never holds up the page that asked for it. */
class QueuedResetPassword extends ResetPassword implements ShouldQueue
{
    use Queueable;
}
