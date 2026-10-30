<?php

namespace App\Http\Controllers\Admin;

use App\Authorization\Ability;
use App\Enums\Role;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\InviteRequest;
use App\Models\Clinic;
use App\Models\Invitation;
use App\Models\User;
use App\Services\StaffService;
use App\Views\Admin\StaffView;
use App\Views\InvitationView;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

/** D4: the clinic's receptionists and admins, and their invitations. */
class StaffController extends Controller
{
    public function __construct(private readonly StaffService $staff) {}

    public function index(Request $request, StaffView $view): Response|JsonResponse
    {
        if (! $request->expectsJson()) {
            return Inertia::render('admin/staff');
        }

        Gate::authorize(Ability::ManageStaff->value);

        return response()->json($view->of($this->clinic($request), $this->me($request)));
    }

    public function invite(InviteRequest $request): JsonResponse
    {
        Gate::authorize(Ability::ManageStaff->value);

        $invitation = $this->staff->invite($this->clinic($request), $request->string('email')->toString(), Role::from($request->string('role')->toString()));

        return response()->json(InvitationView::of($invitation), 201);
    }

    public function resend(Invitation $invitation): JsonResponse
    {
        Gate::authorize(Ability::ManageStaff->value);

        return response()->json(InvitationView::of($this->staff->resend($invitation)));
    }

    public function revoke(Invitation $invitation): JsonResponse
    {
        Gate::authorize(Ability::ManageStaff->value);

        $this->staff->revoke($invitation);

        return response()->json(['ok' => true]);
    }

    /** `PATCH /admin/staff/{id}/deactivate` with `{active}`: switch a person off (the default) or back on. */
    public function setActive(Request $request, string $id): JsonResponse
    {
        Gate::authorize(Ability::ManageStaff->value);

        $request->validate(['active' => ['sometimes', 'boolean']]);
        $active = $request->boolean('active');

        $target = User::query()->inCurrentClinic()
            ->whereIn('role', [Role::ClinicAdmin->value, Role::Receptionist->value])
            ->whereKey($id)->firstOrFail();

        $user = $this->staff->setActive($target, $active, $this->me($request));

        // The person as the screens' `User` type: the page only needs it to confirm the change.
        return response()->json([
            'id' => (string) $user->id,
            'clinicId' => $user->clinic_id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role?->value,
            'active' => $user->is_active,
            'locale' => $user->locale,
        ]);
    }

    private function me(Request $request): User
    {
        /** @var User */
        return $request->user();
    }

    private function clinic(Request $request): Clinic
    {
        /** @var Clinic */
        return $request->user()->clinic;
    }
}
