<?php

namespace App\Views\Admin;

use App\Models\Clinic;
use App\Models\Doctor;
use App\Models\Service;
use App\Views\ClinicView;
use App\Views\DoctorView;
use App\Views\ServiceView;

/** `AdminServicesView`: the services with the doctors who offer each, and the doctors to choose from. */
final class ServicesView
{
    /**
     * @return array<string, mixed>
     */
    public static function of(Clinic $clinic): array
    {
        $doctors = Doctor::query()->with('services')->orderBy('display_name')->get();

        return [
            'clinic' => ClinicView::of($clinic),
            'services' => Service::query()->orderBy('name')->get()
                ->map(fn (Service $service) => [
                    'service' => ServiceView::of($service),
                    'doctorIds' => $doctors->filter(fn (Doctor $d) => $d->services->contains('id', $service->id))->pluck('id')->values()->all(),
                ])->all(),
            'doctors' => $doctors->map(fn (Doctor $d) => DoctorView::of($d))->all(),
        ];
    }
}
