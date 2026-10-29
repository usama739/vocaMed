<?php

namespace App\Support;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Facades\Cache;

/**
 * The emails the app sent while developing, kept so they can be read in the browser (`/dev/inbox`) instead of
 * being dug out of the log. Only recorded on a local machine; production has a real mailer.
 */
class DevInbox
{
    private const KEY = 'vocamed.dev-inbox';

    private const KEEP = 20;

    public static function record(string $to, MailMessage $mail): void
    {
        $messages = self::all();

        array_unshift($messages, [
            'to' => $to,
            'subject' => $mail->subject,
            'greeting' => $mail->greeting,
            'lines' => [...$mail->introLines, ...$mail->outroLines],
            'action' => $mail->actionUrl === null ? null : ['text' => $mail->actionText, 'url' => $mail->actionUrl],
            'at' => now()->toDateTimeString(),
        ]);

        Cache::forever(self::KEY, array_slice($messages, 0, self::KEEP));
    }

    /**
     * @return list<array{to: string, subject: string|null, greeting: string|null, lines: list<string>, action: array{text: string|null, url: string}|null, at: string}>
     */
    public static function all(): array
    {
        $stored = Cache::get(self::KEY, []);

        return is_array($stored) ? array_values($stored) : [];
    }

    public static function clear(): void
    {
        Cache::forget(self::KEY);
    }
}
