<?php

namespace App\Services;

use App\Data\AvailabilityDraft;
use App\Models\Doctor;
use Illuminate\Support\Facades\DB;

/**
 * The clinic's doctors: profile, the services each offers, and weekly availability, saved together in one transaction so
 * a failed save leaves nothing half done. Deactivating a doctor hides them from booking and never cancels anything.
 *
 * @phpstan-import-type Draft from AvailabilityDraft
 */
class DoctorCatalog
{
    public function __construct(private readonly Audit $audit, private readonly AvailabilityService $availability) {}

    /**
     * @param  array<string, mixed>  $profile  name, specialty, languages, serviceIds, active (validated)
     * @param  Draft  $availability
     */
    public function create(array $profile, array $availability): Doctor
    {
        return DB::transaction(function () use ($profile, $availability): Doctor {
            $doctor = new Doctor;
            $doctor->forceFill($this->attributes($profile))->save();
            $doctor->services()->sync($this->serviceIds($profile));

            $this->availability->save($doctor, $availability);
            $this->audit->record('doctor.created', $doctor, ['name' => $doctor->display_name]);

            return $doctor->load('services');
        });
    }

    /**
     * @param  array<string, mixed>  $profile
     * @param  Draft  $availability
     */
    public function update(Doctor $doctor, array $profile, array $availability): Doctor
    {
        return DB::transaction(function () use ($doctor, $profile, $availability): Doctor {
            $before = $this->snapshot($doctor);
            $wasActive = $doctor->is_active;

            $doctor->forceFill($this->attributes($profile))->save();
            $doctor->services()->sync($this->serviceIds($profile));
            $availabilityChanged = $this->availability->save($doctor, $availability);

            $doctor->load('services');

            if ($this->snapshot($doctor) !== $before) {
                $this->audit->record('doctor.updated', $doctor, ['name' => $doctor->display_name]);
            }

            if ($doctor->is_active !== $wasActive) {
                $this->audit->record($doctor->is_active ? 'doctor.activated' : 'doctor.deactivated', $doctor, ['name' => $doctor->display_name]);
            }

            if ($availabilityChanged) {
                $this->audit->record('availability.updated', $doctor);
            }

            return $doctor;
        });
    }

    /** Hide or show the doctor in booking; their appointments are kept either way. */
    public function setActive(Doctor $doctor, bool $active): Doctor
    {
        if ($doctor->is_active !== $active) {
            DB::transaction(function () use ($doctor, $active): void {
                $doctor->forceFill(['is_active' => $active])->save();
                $this->audit->record($active ? 'doctor.activated' : 'doctor.deactivated', $doctor, ['name' => $doctor->display_name]);
            });
        }

        return $doctor->load('services');
    }

    /**
     * Save a doctor's availability alone (the doctor's own page, or the admin's). Records an entry only when it changed.
     *
     * @param  Draft  $draft
     */
    public function saveAvailability(Doctor $doctor, array $draft): void
    {
        DB::transaction(function () use ($doctor, $draft): void {
            if ($this->availability->save($doctor, $draft)) {
                $this->audit->record('availability.updated', $doctor);
            }
        });
    }

    /**
     * @param  array<string, mixed>  $profile
     * @return array<string, mixed>
     */
    private function attributes(array $profile): array
    {
        return [
            'display_name' => trim((string) $profile['name']),
            'specialty' => trim((string) ($profile['specialty'] ?? '')),
            'languages' => array_values(array_unique((array) ($profile['languages'] ?? []))),
            'is_active' => (bool) $profile['active'],
        ];
    }

    /**
     * @param  array<string, mixed>  $profile
     * @return list<string>
     */
    private function serviceIds(array $profile): array
    {
        return array_values(array_unique(array_map('strval', (array) ($profile['serviceIds'] ?? []))));
    }

    /**
     * What counts as a change to the profile (the active flag is audited on its own).
     *
     * @return list<mixed>
     */
    private function snapshot(Doctor $doctor): array
    {
        $services = $doctor->services->pluck('id')->map(fn ($id) => (string) $id)->sort()->values()->all();

        return [$doctor->display_name, $doctor->specialty, $doctor->languages, $services];
    }
}
