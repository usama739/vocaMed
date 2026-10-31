<?php

namespace App\Http\Controllers;

use App\PatientLinks\LinkViews;
use App\PatientLinks\PatientLinkActions;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The patient link pages (E1 to E4) and what a patient can do from them. The signed token in the address is the only credential; the
 * page itself is the Inertia page, and the same address asked for JSON answers with the page's read model.
 */
class PatientLinkController extends Controller
{
    public function __construct(private readonly LinkViews $views, private readonly PatientLinkActions $actions) {}

    public function manage(Request $request, string $token): Response|JsonResponse
    {
        return $request->expectsJson() ? response()->json($this->views->manage($token)) : Inertia::render('patient/manage', ['token' => $token]);
    }

    public function reschedule(Request $request, string $token): Response|JsonResponse
    {
        return $request->expectsJson() ? response()->json($this->views->reschedule($token)) : Inertia::render('patient/reschedule', ['token' => $token]);
    }

    public function status(Request $request, string $token): Response|JsonResponse
    {
        return $request->expectsJson() ? response()->json($this->views->status($token)) : Inertia::render('patient/status', ['token' => $token]);
    }

    public function expired(Request $request, string $token): Response|JsonResponse
    {
        return $request->expectsJson() ? response()->json($this->views->expired($token)) : Inertia::render('patient/expired', ['token' => $token]);
    }

    public function confirm(string $token): JsonResponse
    {
        return response()->json($this->actions->confirm($token));
    }

    public function cancel(string $token): JsonResponse
    {
        return response()->json($this->actions->cancel($token));
    }

    public function submitReschedule(Request $request, string $token): JsonResponse
    {
        $startsAt = $request->validate(['startsAt' => ['required', 'date']])['startsAt'];

        return response()->json($this->actions->reschedule($token, CarbonImmutable::parse($startsAt)->utc()));
    }

    /** The same answer whether the link is known, expired or unknown. */
    public function requestLink(string $token): JsonResponse
    {
        $this->actions->requestNewLink($token);

        return response()->json(['ok' => true]);
    }
}
