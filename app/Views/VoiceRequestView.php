<?php

namespace App\Views;

use App\Models\VoiceRequest;

/**
 * A voice request as the booking panel polls it (`GET /api/voice/{id}`). `parsed` is the words the parser found; `draft` is the same
 * request resolved to this clinic's real patient, doctor, service and time (null until the resolver exists and has run).
 */
final class VoiceRequestView
{
    /**
     * @return array{id: string, source: string, status: string, transcript: string|null, parsed: array<string, mixed>|null, draft: array<string, mixed>|null, failureCode: string|null}
     */
    public static function of(VoiceRequest $request): array
    {
        $parsed = $request->parsed_json;

        return [
            'id' => $request->id,
            'source' => $request->source->value,
            'status' => $request->status->value,
            'transcript' => $request->transcript,
            'parsed' => $parsed['fields'] ?? null,
            'draft' => $parsed['draft'] ?? null,
            'failureCode' => $request->failure_code,
        ];
    }
}
