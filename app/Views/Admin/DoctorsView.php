<?php

namespace App\Views\Admin;

use App\Booking\Slot;
use App\Booking\SlotService;
use App\Booking\UpcomingCounts;
use App\Models\Clinic;
use App\Models\Doctor;
use App\Models\Service;
use App\Support\ClinicClock;
use App\Views\ClinicView;
use App\Views\DoctorView;

/**
 * `AdminDoctorsView`: the doctors, filtered by a search and a status, each with the next free slot (for the first active
 * service they offer) and how many appointments they still have to come.
 */
final class DoctorsView
{
    public function __construct(private readonly SlotService $slots, private readonly UpcomingCounts $upcoming) {}

    /**
     * @return array<string, mixed>
     */
    public function of(Clinic $clinic, string $query, string $status): array
    {
        $all = Doctor::query()->with('services')->orderBy('display_name')->get();
        $needle = mb_strtolower(trim($query));

        $shown = $all->filter(fn (Doctor $d) => ($status === 'all' || ($status === 'active' ? $d->is_active : ! $d->is_active))
            && ($needle === '' || str_contains(mb_strtolower($d->display_name.' '.$d->specialty), $needle)))->values();

        $counts = $this->upcoming->forDoctors(array_values(array_map('strval', $shown->pluck('id')->all())));

        return [
            'clinic' => ClinicView::of($clinic),
            'today' => ClinicClock::for($clinic)->today(),
            'total' => $all->count(),
            'rows' => $shown->map(fn (Doctor $d) => [
                'doctor' => DoctorView::of($d),
                'nextFree' => $this->nextFree($clinic, $d)?->toArray(),
                'upcoming' => $counts[$d->id] ?? 0,
            ])->all(),
        ];
    }

    /** The first free slot for the first active service the doctor offers; none for a doctor who is switched off. */
    private function nextFree(Clinic $clinic, Doctor $doctor): ?Slot
    {
        $service = $doctor->is_active ? $doctor->services->where('is_active', true)->sortBy('name')->first() : null;

        return $service instanceof Service ? $this->slots->nextFree($clinic, $doctor, $service) : null;
    }
}
