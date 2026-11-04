<?php

namespace App\Voice\Speech;

use App\Voice\Contracts\SpeechToText;
use App\Voice\SpeechFailed;
use App\Voice\SpeechInput;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Speech to text through any OpenAI-compatible audio API (`POST {base}/audio/transcriptions`): Groq's Whisper now, OpenAI's or our own
 * Whisper server later, by changing the base address, key and model. The recording goes up as a file; the answer is `{"text": "..."}`.
 *
 * What went wrong is reported as a short reason and whether trying again may help: a busy provider (429), one that is down or slow
 * (5xx, a timeout, an unreadable answer) may recover; a refused key or an unusable recording will not. The key and the provider's own
 * message are never put into an error or a log.
 */
class WhisperHttpSpeech implements SpeechToText
{
    public function __construct(
        private readonly string $baseUrl,
        private readonly string $apiKey,
        private readonly string $model,
        private readonly ?string $language = null,
        private readonly int $timeout = 30,
    ) {}

    public function transcribe(SpeechInput $input): string
    {
        if ($this->apiKey === '' || $this->baseUrl === '') {
            throw new SpeechFailed('not_configured');
        }

        try {
            $response = Http::withToken($this->apiKey)
                ->acceptJson()
                ->timeout($this->timeout)
                ->attach('file', $input->contents, $input->filename, ['Content-Type' => $input->mime])
                ->post(rtrim($this->baseUrl, '/').'/audio/transcriptions', array_filter([
                    'model' => $this->model,
                    'response_format' => 'json',
                    'temperature' => 0,
                    'language' => $input->language ?? $this->language,
                    'prompt' => $input->prompt,
                ], fn ($value) => $value !== null && $value !== ''));
        } catch (ConnectionException) {
            throw new SpeechFailed('unavailable', retryable: true);
        }

        if (! $response->successful()) {
            throw $this->refusal($response);
        }

        $text = $response->json('text');

        if (! is_string($text)) {
            throw new SpeechFailed('unavailable', retryable: true);
        }

        return trim($text);
    }

    private function refusal(Response $response): SpeechFailed
    {
        $status = $response->status();

        Log::warning('The speech provider refused a recording.', ['status' => $status, 'model' => $this->model]);

        return match (true) {
            $status === 429 => new SpeechFailed('rate_limited', retryable: true),
            $status === 401 || $status === 403 => new SpeechFailed('provider_auth'),
            $status === 408 || $status >= 500 => new SpeechFailed('unavailable', retryable: true),
            default => new SpeechFailed('rejected'),
        };
    }
}
