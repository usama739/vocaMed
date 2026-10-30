<?php

/*
 * One racer for tests/Feature/Booking/ConcurrencyTest.php: boots the application in its own PHP process against the given SQLite file,
 * waits for the start signal, then tries to book one slot and prints what happened as one line of JSON.
 *
 * Usage: php book-race.php <dbFile> <clinicId> <userId> <patientId> <doctorId> <serviceId> <startsAtIso> <nowIso> <readyFile> <goFile>
 */

use App\Booking\BookingRequest;
use App\Booking\BookingService;
use App\Enums\BookingSource;
use App\Exceptions\DomainException;
use App\Models\Clinic;
use App\Models\User;
use App\Support\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Carbon;

[, $dbFile, $clinicId, $userId, $patientId, $doctorId, $serviceId, $startsAt, $now, $readyFile, $goFile] = $argv;

foreach (['DB_CONNECTION' => 'sqlite', 'DB_DATABASE' => $dbFile, 'CACHE_STORE' => 'array', 'SESSION_DRIVER' => 'array', 'QUEUE_CONNECTION' => 'sync', 'MAIL_MAILER' => 'array', 'APP_ENV' => 'testing', 'APP_DEBUG' => 'false'] as $key => $value) {
    putenv("$key=$value");
    $_ENV[$key] = $value;
    $_SERVER[$key] = $value;
}

require dirname(__DIR__, 2).'/vendor/autoload.php';

$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

config([
    'database.connections.sqlite.busy_timeout' => 30000,
    'database.connections.sqlite.journal_mode' => 'WAL',
    'vocamed.holds_store' => 'array',
]);
Carbon::setTestNow($now);

// Ready: everything is loaded. Then wait for the others, so the bookings start at the same moment.
touch($readyFile);

while (! file_exists($goFile)) {
    usleep(200);
}

try {
    $clinic = Clinic::query()->findOrFail($clinicId);
    $user = User::query()->findOrFail($userId);
    $request = new BookingRequest($patientId, $doctorId, $serviceId, CarbonImmutable::parse($startsAt)->utc(), BookingSource::Manual);

    $appointment = $app->make(TenantContext::class)->run($clinic, fn () => $app->make(BookingService::class)->book($clinic, $user, $request));

    echo json_encode(['ok' => true, 'id' => $appointment->id]);
} catch (DomainException $e) {
    echo json_encode(['ok' => false, 'code' => $e->errorCode()]);
} catch (Throwable $e) {
    echo json_encode(['ok' => false, 'code' => 'ERROR', 'message' => get_class($e).': '.$e->getMessage()]);
}
