<?php

use App\Enums\Role;
use App\Models\Doctor;
use App\Models\User;
use Illuminate\Support\Facades\Broadcast;

/*
| Who may listen to what (see `App\Live\LiveUpdate`). Both channels are private: the browser asks `/broadcasting/auth`
| with its own session, so a person who is signed out, deactivated, or from another clinic is refused.
*/

// The whole clinic's changes: for the clinic admin and reception.
Broadcast::channel('clinic.{clinicId}', function (User $user, string $clinicId): bool {
    return $user->clinic_id === $clinicId && in_array($user->role, [Role::ClinicAdmin, Role::Receptionist], true);
});

// One doctor's own changes: only that doctor (the clinic admin and reception already hear everything on the clinic channel).
Broadcast::channel('clinic.{clinicId}.doctor.{doctorId}', function (User $user, string $clinicId, string $doctorId): bool {
    return $user->clinic_id === $clinicId
        && $user->role === Role::Doctor
        && Doctor::query()->whereKey($doctorId)->where('clinic_id', $clinicId)->where('user_id', $user->id)->exists();
});
