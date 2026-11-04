<?php

namespace App\Voice;

/**
 * One recording as a speech driver receives it. `language` (an ISO code such as "ur") and `prompt` (words the speaker is likely to
 * say, such as the clinic's doctor names) are hints; null means "work it out" and "no hint".
 */
final class SpeechInput
{
    public function __construct(
        public readonly string $contents,
        public readonly string $mime,
        public readonly string $filename,
        public readonly ?string $language = null,
        public readonly ?string $prompt = null,
    ) {}

    /** A browser recording; the file name's extension tells the provider the format. */
    public static function forRecording(string $contents, string $mime, ?string $language = null, ?string $prompt = null): self
    {
        $extension = match (true) {
            str_contains($mime, 'webm') => 'webm',
            str_contains($mime, 'ogg') => 'ogg',
            str_contains($mime, 'wav') => 'wav',
            str_contains($mime, 'flac') => 'flac',
            str_contains($mime, 'mpeg') => 'mp3',
            default => 'm4a',
        };

        return new self($contents, $mime, "recording.$extension", $language, $prompt);
    }
}
