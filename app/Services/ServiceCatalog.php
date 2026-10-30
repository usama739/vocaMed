<?php

namespace App\Services;

use App\Exceptions\DuplicateName;
use App\Models\Service;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;

/** The clinic's services: what can be booked, how long it takes, and which doctors offer it. */
class ServiceCatalog
{
    public function __construct(private readonly Audit $audit) {}

    /**
     * @param  array<string, mixed>  $input  name, durationMin, bufferMin, doctorIds (validated)
     */
    public function create(array $input): Service
    {
        return $this->write(new Service, $input, 'service.created');
    }

    /**
     * @param  array<string, mixed>  $input  name, durationMin, bufferMin, doctorIds (validated)
     */
    public function update(Service $service, array $input): Service
    {
        return $this->write($service, $input, 'service.updated');
    }

    /** Off hides the service from booking; its appointments are kept. */
    public function setActive(Service $service, bool $active): Service
    {
        if ($service->is_active === $active) {
            return $service;
        }

        return DB::transaction(function () use ($service, $active): Service {
            $service->forceFill(['is_active' => $active])->save();
            $this->audit->record($active ? 'service.activated' : 'service.deactivated', $service, ['name' => $service->name]);

            return $service;
        });
    }

    /**
     * @param  array<string, mixed>  $input  name, durationMin, bufferMin, doctorIds (validated)
     */
    private function write(Service $service, array $input, string $action): Service
    {
        $name = trim((string) $input['name']);

        $this->refuseDuplicate($name, $service);

        try {
            return DB::transaction(function () use ($service, $input, $name, $action): Service {
                $service->forceFill([
                    'name' => $name,
                    'duration_minutes' => (int) $input['durationMin'],
                    'buffer_minutes' => (int) $input['bufferMin'],
                ] + ($service->exists ? [] : ['is_active' => true]))->save();

                $service->doctors()->sync((array) $input['doctorIds']);
                $this->audit->record($action, $service, ['name' => $name]);

                return $service;
            });
        } catch (UniqueConstraintViolationException) {
            // Two admins saving the same name at once: the index decides.
            throw new DuplicateName;
        }
    }

    private function refuseDuplicate(string $name, Service $service): void
    {
        $taken = Service::query()
            ->whereRaw('lower(name) = ?', [mb_strtolower($name)])
            ->when($service->exists, fn ($query) => $query->whereKeyNot($service->getKey()))
            ->exists();

        if ($taken) {
            throw new DuplicateName;
        }
    }
}
