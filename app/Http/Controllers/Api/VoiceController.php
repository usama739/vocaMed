<?php

namespace App\Http\Controllers\Api;

use App\Authorization\Ability;
use App\Http\Controllers\Controller;
use App\Http\Requests\Voice\ParseVoiceTextRequest;
use App\Http\Requests\Voice\TranscribeVoiceRequest;
use App\Models\User;
use App\Models\VoiceRequest;
use App\Views\VoiceRequestView;
use App\Voice\VoiceRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/**
 * Asking for a booking by voice or by typed command. Both answer 202 with the request's id straight away; the screen then asks for
 * the request until it is `ready` (a draft to review) or `failed`. Nothing here books: the draft is confirmed on the booking panel.
 */
class VoiceController extends Controller
{
    public function __construct(private readonly VoiceRequests $requests) {}

    /** A recording of the receptionist's request. */
    public function transcribe(TranscribeVoiceRequest $request): JsonResponse
    {
        $voice = $this->requests->acceptAudio($this->user($request), $request->file('audio'), (float) $request->input('durationSeconds'));

        return $this->accepted($voice);
    }

    /** A request typed into the command box. */
    public function parseText(ParseVoiceTextRequest $request): JsonResponse
    {
        return $this->accepted($this->requests->acceptText($this->user($request), (string) $request->input('text')));
    }

    /** Where the request is now. Only the person who made it can read it; anyone else (or another clinic) is told it does not exist. */
    public function show(Request $request, VoiceRequest $voiceRequest): JsonResponse
    {
        Gate::authorize(Ability::UseVoice->value);

        abort_unless($voiceRequest->user_id === $this->user($request)->id, 404);

        return response()->json(VoiceRequestView::of($voiceRequest));
    }

    private function accepted(VoiceRequest $voice): JsonResponse
    {
        return response()->json(['id' => $voice->id, 'status' => $voice->status->value], 202);
    }

    private function user(Request $request): User
    {
        /** @var User */
        return $request->user();
    }
}
