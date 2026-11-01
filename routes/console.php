<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;
use Laravel\Telescope\Telescope;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Reminders before visits: due ones are filed every minute (each only once), and a queue worker sends them.
Schedule::command('messages:reminders')->everyMinute()->withoutOverlapping();

// Telescope (developer machine only) keeps two days of entries.
if (app()->environment('local') && class_exists(Telescope::class)) {
    Schedule::command('telescope:prune --hours=48')->daily();
}
