<?php

namespace App\Services;

use App\Exceptions\DuplicatePhone;
use App\Exceptions\InvalidPhone;
use App\Models\Clinic;
use App\Models\Patient;
use App\Support\PhoneNumber;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;

/**
 * The clinic's patients: create, edit, find. A phone number belongs to one patient within a clinic; walk-ins may be added
 * with a name only. Every change leaves an audit entry naming the fields touched, never their values.
 */
class PatientDirectory
{
    public function __construct(private readonly Audit $audit) {}

    /**
     * @param  array<string, mixed>  $input  name, phone, noPhone?, preferredLocale?, preferredChannel?, consent?, notes?
     */
    public function create(Clinic $clinic, array $input): Patient
    {
        $phone = $this->phoneForCreate($clinic, $input);
        $this->refuseTakenPhone($phone);

        try {
            return DB::transaction(function () use ($clinic, $input, $phone): Patient {
                $patient = new Patient;
                $patient->forceFill([
                    'name' => $this->name((string) $input['name']),
                    'phone' => $phone,
                    'preferred_locale' => $input['preferredLocale'] ?? $clinic->default_locale,
                    'preferred_channel' => $input['preferredChannel'] ?? 'sms',
                    'consent_at' => ! empty($input['consent']) ? now() : null,
                    'notes' => $this->notes($input['notes'] ?? null),
                ])->save();

                $this->audit->record('patient.created', $patient);

                return $patient;
            });
        } catch (UniqueConstraintViolationException) {
            // Two receptionists adding the same number at once: the index decides.
            throw new DuplicatePhone;
        }
    }

    /**
     * Change only the fields sent. The phone can be changed but not cleared.
     *
     * @param  array<string, mixed>  $patch
     */
    public function update(Clinic $clinic, Patient $patient, array $patch): Patient
    {
        $changes = [];

        if (array_key_exists('name', $patch)) {
            $changes['name'] = $this->name((string) $patch['name']);
        }

        if (array_key_exists('phone', $patch)) {
            $phone = PhoneNumber::normalize((string) $patch['phone'], $clinic->callingCode()) ?? throw new InvalidPhone;
            $this->refuseTakenPhone($phone, $patient);
            $changes['phone'] = $phone;
        }

        if (array_key_exists('preferredLocale', $patch)) {
            $changes['preferred_locale'] = $patch['preferredLocale'];
        }

        if (array_key_exists('preferredChannel', $patch)) {
            $changes['preferred_channel'] = $patch['preferredChannel'];
        }

        if (array_key_exists('consent', $patch)) {
            // Turning consent on records when; leaving it on keeps the first time; turning it off clears it.
            $changes['consent_at'] = $patch['consent'] ? ($patient->consent_at ?? now()) : null;
        }

        if (array_key_exists('notes', $patch)) {
            $changes['notes'] = $this->notes($patch['notes']);
        }

        $patient->forceFill($changes);
        $touched = $this->touched($patient);

        if ($touched === []) {
            return $patient;
        }

        try {
            DB::transaction(function () use ($patient, $touched): void {
                $patient->save();
                $this->audit->record('patient.updated', $patient, ['fields' => implode(',', $touched)]);
            });
        } catch (UniqueConstraintViolationException) {
            throw new DuplicatePhone;
        }

        return $patient;
    }

    /**
     * Phone matches first (three or more digits, a leading 0 ignored), then names that contain the text, up to a limit.
     *
     * @return Collection<int, Patient>
     */
    public function search(string $query, int $limit): Collection
    {
        $query = trim($query);

        if ($query === '') {
            return new Collection;
        }

        $digits = PhoneNumber::searchDigits($query);
        $byPhone = strlen($digits) >= 3
            ? $this->counted(Patient::query()->where('phone', 'like', '%'.$digits.'%'))->orderBy('name')->orderBy('id')->limit($limit)->get()
            : new Collection;

        $byName = $this->counted(Patient::query())
            ->whereRaw("lower(name) like ? escape '!'", ['%'.$this->escapedLike(mb_strtolower($query)).'%'])
            ->whereNotIn('id', $byPhone->pluck('id'))
            ->orderBy('name')->orderBy('id')->limit($limit)->get();

        return $byPhone->concat($byName)->take($limit)->values();
    }

    /**
     * The newest patients. (Becomes "last visit first" when appointments exist.)
     *
     * @return Collection<int, Patient>
     */
    public function recent(int $limit): Collection
    {
        return $this->counted(Patient::query())->orderByDesc('created_at')->orderByDesc('id')->limit($limit)->get();
    }

    /**
     * @param  array<string, mixed>  $input
     */
    private function phoneForCreate(Clinic $clinic, array $input): ?string
    {
        $raw = trim((string) ($input['phone'] ?? ''));

        if ($raw === '' && ! empty($input['noPhone'])) {
            return null;
        }

        return PhoneNumber::normalize($raw, $clinic->callingCode()) ?? throw new InvalidPhone;
    }

    private function refuseTakenPhone(?string $phone, ?Patient $except = null): void
    {
        if ($phone === null) {
            return;
        }

        $taken = Patient::query()->where('phone', $phone)
            ->when($except !== null, fn ($query) => $query->whereKeyNot($except?->getKey()))->exists();

        if ($taken) {
            throw new DuplicatePhone;
        }
    }

    /**
     * Add each patient's no-show count to a list query in one go.
     *
     * @param  Builder<Patient>  $query
     * @return Builder<Patient>
     */
    private function counted($query)
    {
        return $query->withCount(['appointments as no_show_count' => fn ($appointments) => $appointments->where('status', 'no_show')]);
    }

    /** Trimmed, with runs of spaces made single. */
    private function name(string $name): string
    {
        return trim(preg_replace('/\s+/u', ' ', $name) ?? $name);
    }

    private function notes(mixed $notes): ?string
    {
        $notes = is_string($notes) ? trim($notes) : '';

        return $notes === '' ? null : $notes;
    }

    /**
     * The edit names (screens' field names) of what actually changed.
     *
     * @return list<string>
     */
    private function touched(Patient $patient): array
    {
        $map = ['name' => 'name', 'phone' => 'phone', 'preferred_locale' => 'preferredLocale', 'preferred_channel' => 'preferredChannel', 'consent_at' => 'consent', 'notes' => 'notes'];
        $touched = [];

        foreach ($map as $column => $name) {
            if ($patient->isDirty($column)) {
                $touched[] = $name;
            }
        }

        return $touched;
    }

    private function escapedLike(string $text): string
    {
        return str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $text);
    }
}
