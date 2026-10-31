<?php

namespace App\Messaging\Channels;

use App\Messaging\Contracts\MessageChannel;
use App\Messaging\OutgoingMessage;
use Illuminate\Mail\Message;
use Illuminate\Support\Facades\Mail;

/**
 * Really sends the message as a plain-text email through Laravel's mail (whichever mailer `MAIL_MAILER` names: Mailtrap, a provider,
 * or the log). A failure to reach the mail server is temporary: it throws as it is, and the job tries again later.
 */
final class MailChannel implements MessageChannel
{
    public function send(OutgoingMessage $message): void
    {
        Mail::raw($message->body, function (Message $mail) use ($message): void {
            $mail->to($message->to)->subject($message->subject);
        });
    }
}
