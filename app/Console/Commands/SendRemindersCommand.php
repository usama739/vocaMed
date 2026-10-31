<?php

namespace App\Console\Commands;

use App\Messaging\Messenger;
use App\Models\Appointment;
use App\Models\Clinic;
use App\Support\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;

/**
 * Files the reminders that have come due, for every clinic, at the hours before a visit that the clinic chose (24 and 2 by default). It
 * runs every minute. A reminder is due when its hour has come round and not more than the grace period (an hour) ago, so a scheduler
 * that was switched off never sends yesterday's reminder this morning; a visit booked inside a reminder's window never gets that one;
 * and each reminder is filed once however often this runs.
 */
class SendRemindersCommand extends Command
{
    protected $signature = 'messages:reminders';

    protected $description = 'File the reminders that have come due';

    public function handle(TenantContext $tenant, Messenger $messenger): int
    {
        $filed = 0;
        $grace = (int) config('vocamed.messages.reminder_grace_minutes');

        $tenant->eachClinic(function (Clinic $clinic) use ($messenger, $grace, &$filed): void {
            $now = CarbonImmutable::now();

            foreach ($clinic->settingsData()->reminderHoursBefore as $hours) {
                $appointments = Appointment::query()->with('patient')
                    ->whereIn('status', ['booked', 'confirmed'])
                    ->where('source', '!=', 'walk_in')
                    ->where('starts_at', '>', $now)
                    ->where('starts_at', '<=', $now->addHours($hours))
                    ->where('starts_at', '>', $now->addHours($hours)->subMinutes($grace))
                    ->get();

                foreach ($appointments as $appointment) {
                    // Booked after the reminder's time had already passed: that reminder does not apply.
                    if ($appointment->created_at !== null && $appointment->created_at->greaterThan($appointment->starts_at->copy()->subHours($hours))) {
                        continue;
                    }

                    if ($messenger->file($appointment, 'reminder', $hours) !== null) {
                        $filed++;
                    }
                }
            }
        });

        $this->info("Filed {$filed} reminder(s).");

        return self::SUCCESS;
    }
}
