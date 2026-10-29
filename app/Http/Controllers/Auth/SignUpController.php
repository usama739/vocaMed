<?php

namespace App\Http\Controllers\Auth;

use App\Data\NewClinic;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\SignUpRequest;
use App\Notifications\ConfirmClinicEmail;
use App\Services\ClinicService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Self-service clinic sign-up, behind `vocamed.self_service_signup`. Creates the clinic and its admin, but the
 * admin cannot sign in until the emailed link is followed.
 */
class SignUpController extends Controller
{
    public function create(): Response|RedirectResponse
    {
        if (! config('vocamed.self_service_signup')) {
            // Not open yet: send people to the landing page, where they can ask for a demo.
            return redirect('/');
        }

        return Inertia::render('auth/register');
    }

    public function store(SignUpRequest $request, ClinicService $clinics): JsonResponse|RedirectResponse
    {
        abort_unless(config('vocamed.self_service_signup'), 404);

        $admin = $clinics->create(NewClinic::fromValidated($request->validated()), emailVerified: false);
        $admin->notify(new ConfirmClinicEmail);

        return $request->wantsJson()
            ? response()->json(['ok' => true])
            : back()->with('status', 'confirmation-sent');
    }
}
