<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Reminders before visits: due ones are filed every minute (each only once), and a queue worker sends them.
Schedule::command('messages:reminders')->everyMinute()->withoutOverlapping();
