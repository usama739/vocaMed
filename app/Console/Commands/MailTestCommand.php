<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Mail\Message;
use Illuminate\Support\Facades\Mail;
use Throwable;

/** Sends one plain test email right now (not queued), to check that the mail settings in `.env` really deliver. */
class MailTestCommand extends Command
{
    protected $signature = 'mail:test {to : the address to send the test to}';

    protected $description = 'Send a test email with the current mail settings';

    public function handle(): int
    {
        $to = (string) $this->argument('to');

        if (filter_var($to, FILTER_VALIDATE_EMAIL) === false) {
            $this->error('That is not an email address.');

            return self::FAILURE;
        }

        $mailer = (string) config('mail.default');
        $from = (string) config('mail.from.address');

        try {
            Mail::raw('If you can read this, VocaMed can send email with these settings.', function (Message $mail) use ($to): void {
                $mail->to($to)->subject('VocaMed mail test');
            });
        } catch (Throwable $e) {
            $this->error("Sending with the \"{$mailer}\" mailer failed: {$e->getMessage()}");

            return self::FAILURE;
        }

        $this->info("Sent through the \"{$mailer}\" mailer, from {$from}, to {$to}.");

        if ($mailer === 'log') {
            $this->warn('The log mailer sends nothing: the message is in storage/logs/laravel.log. Set MAIL_MAILER=smtp and the MAIL_* settings for real delivery.');
        }

        return self::SUCCESS;
    }
}
