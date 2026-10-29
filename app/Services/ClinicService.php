<?php

namespace App\Services;

use App\Data\NewClinic;
use App\Enums\ClinicStatus;
use App\Enums\Role;
use App\Models\Clinic;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ClinicService
{
    /**
     * Open a clinic and its first admin, together or not at all. The admin comes back with the clinic
     * loaded. An operator opening a clinic with the command vouches for the address, so it starts
     * verified; the sign-up page passes false and sends a confirmation link instead.
     */
    public function create(NewClinic $data, bool $emailVerified = true): User
    {
        return DB::transaction(function () use ($data, $emailVerified): User {
            $clinic = new Clinic([
                'name' => $data->clinicName,
                'slug' => $this->uniqueSlug($data->clinicName),
                'country' => $data->country,
                'timezone' => $data->timezone,
                'default_locale' => $data->locale,
            ]);
            $clinic->status = ClinicStatus::Active;
            $clinic->save();

            $admin = new User([
                'name' => $data->adminName,
                'email' => $data->adminEmail,
                'password' => $data->adminPassword,
                'locale' => $data->locale,
            ]);
            $admin->forceFill([
                'clinic_id' => $clinic->id,
                'role' => Role::ClinicAdmin,
                'is_active' => true,
                'email_verified_at' => $emailVerified ? now() : null,
            ])->save();

            return $admin->setRelation('clinic', $clinic);
        });
    }

    private function uniqueSlug(string $name): string
    {
        $base = Str::slug($name) ?: 'clinic';
        $slug = $base;

        while (Clinic::query()->where('slug', $slug)->exists()) {
            $slug = $base.'-'.Str::lower(Str::random(4));
        }

        return $slug;
    }
}
