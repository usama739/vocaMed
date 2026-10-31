<?php

namespace App\Console\Commands;

use App\Models\Appointment;
use App\Models\Clinic;
use App\PatientLinks\PatientLinks;
use App\Support\TenantContext;
use Illuminate\Console\Command;

/**
 * Prints a working patient link for an appointment, until the messages step sends them. The link is shown once and cannot be
 * recovered later (only its hash is stored), so run it again for another.
 */
class PatientLinkCommand extends Command
{
    protected $signature = 'patient:link {appointment : the appointment id}';

    protected $description = 'Print a new private link for an appointment (shown once)';

    public function handle(TenantContext $tenant, PatientLinks $links): int
    {
        $appointment = $tenant->bypass(fn () => Appointment::query()->find((string) $this->argument('appointment')));

        if ($appointment === null) {
            $this->error('No appointment with that id.');

            return self::FAILURE;
        }

        $clinic = $tenant->bypass(fn () => Clinic::query()->findOrFail($appointment->clinic_id));
        $token = $tenant->run($clinic, fn () => $links->issue($appointment));

        $this->line($links->urlFor($token));

        return self::SUCCESS;
    }
}
