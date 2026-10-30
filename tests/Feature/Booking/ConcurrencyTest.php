<?php

namespace Tests\Feature\Booking;

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\BuildsBookingWorld;
use Tests\TestCase;

/**
 * Nobody is double booked, even when several people try at the same instant. These are REAL separate PHP processes (not
 * simulated ones) booking against one database file, released together by a start signal. SQLite lets only one writer at a time,
 * so a loser may be turned away either by the booking check (SLOT_UNAVAILABLE) or by the database being busy; both are a clean
 * loss with nothing written. What must never happen is two appointments on overlapping time, and that is what is asserted.
 * The same race on MySQL stays on the before-going-live list, to be run once MySQL is connected.
 */
class ConcurrencyTest extends TestCase
{
    use BuildsBookingWorld;

    private string $file = '';

    protected function setUp(): void
    {
        parent::setUp();

        if (! function_exists('proc_open')) {
            $this->markTestSkipped('proc_open is disabled, so separate processes cannot be started.');
        }

        $this->file = sys_get_temp_dir().DIRECTORY_SEPARATOR.'vocamed-race-'.bin2hex(random_bytes(4)).'.sqlite';
        touch($this->file);

        config([
            'database.connections.sqlite.database' => $this->file,
            'database.connections.sqlite.busy_timeout' => 30000,
            'database.connections.sqlite.journal_mode' => 'WAL',
        ]);
        DB::purge('sqlite');
        Artisan::call('migrate', ['--force' => true]);

        $this->buildBookingWorld();
    }

    protected function tearDown(): void
    {
        $this->tearDownBookingWorld();
        DB::disconnect('sqlite');
        DB::purge('sqlite');

        foreach (['', '-wal', '-shm'] as $suffix) {
            @unlink($this->file.$suffix);
        }

        parent::tearDown();
    }

    /**
     * Start one racer per start time, wait until every one is loaded, release them together and collect what each printed.
     *
     * @param  list<string>  $startTimes  clinic-local times such as "2026-11-02 10:00"
     * @return list<array<string, mixed>>
     */
    private function race(array $startTimes): array
    {
        $dir = sys_get_temp_dir().DIRECTORY_SEPARATOR.'vocamed-go-'.bin2hex(random_bytes(4));
        mkdir($dir);
        $go = $dir.DIRECTORY_SEPARATOR.'go';
        $processes = [];

        foreach ($startTimes as $i => $local) {
            $ready = $dir.DIRECTORY_SEPARATOR."ready-$i";
            $command = [
                PHP_BINARY, base_path('tests/Support/book-race.php'), $this->file, $this->clinic->id, (string) $this->reception->id,
                $this->patient->id, $this->doctor->id, $this->service->id, $this->at($local)->toIso8601String(), '2026-11-01 10:00:00', $ready, $go,
            ];

            $process = proc_open($command, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, base_path());
            $processes[] = ['process' => $process, 'pipes' => $pipes, 'ready' => $ready];
        }

        // Wait (up to two minutes on a slow machine) until every racer has booted, then let them all go at once.
        $deadline = microtime(true) + 120;

        while (microtime(true) < $deadline && count(array_filter($processes, fn ($p) => file_exists($p['ready']))) < count($processes)) {
            usleep(50_000);
        }

        $this->assertSame(count($processes), count(array_filter($processes, fn ($p) => file_exists($p['ready']))), 'every racer should have started');
        touch($go);

        $results = [];

        foreach ($processes as $p) {
            $out = trim((string) stream_get_contents($p['pipes'][1]));
            $err = trim((string) stream_get_contents($p['pipes'][2]));
            fclose($p['pipes'][1]);
            fclose($p['pipes'][2]);
            proc_close($p['process']);

            $decoded = json_decode($out, true);
            $results[] = is_array($decoded) ? $decoded : ['ok' => false, 'code' => 'NO_OUTPUT', 'message' => $out.' | '.$err];
        }

        @unlink($go);
        array_map('unlink', glob($dir.DIRECTORY_SEPARATOR.'ready-*') ?: []);
        @rmdir($dir);

        return $results;
    }

    /**
     * SQLite lets one writer in at a time, so on a heavily loaded machine every racer can time out on the lock and nobody books.
     * That says nothing about the guard, so go again (up to three rounds, from an empty calendar) until someone gets in.
     *
     * @param  list<string>  $startTimes
     * @param  int  $contenders  how many of the first racers fight over the same time
     * @return list<array<string, mixed>>
     */
    private function raceUntilSomeoneWins(array $startTimes, int $contenders): array
    {
        for ($round = 1; ; $round++) {
            $results = $this->race($startTimes);

            if ($round === 3 || array_filter(array_slice($results, 0, $contenders), fn ($r) => $r['ok'] === true) !== []) {
                return $results;
            }

            DB::table('appointment_slots')->delete();
            DB::table('appointments')->delete();
        }
    }

    /** A loss that wrote nothing: the booking said the slot is taken, or the single-writer database was busy. */
    private function isCleanLoss(array $result): bool
    {
        return $result['ok'] === false && ($result['code'] === 'SLOT_UNAVAILABLE' || str_contains((string) ($result['message'] ?? ''), 'database is locked') || str_contains((string) ($result['message'] ?? ''), 'database table is locked'));
    }

    public function test_several_processes_booking_the_same_slot_at_once_produce_exactly_one_appointment()
    {
        $results = $this->raceUntilSomeoneWins(['2026-11-02 10:00', '2026-11-02 10:00', '2026-11-02 10:00', '2026-11-02 10:00'], 4);

        $winners = array_values(array_filter($results, fn ($r) => $r['ok'] === true));
        $unexpected = array_values(array_filter($results, fn ($r) => $r['ok'] === false && ! $this->isCleanLoss($r)));

        $this->assertSame([], $unexpected, 'a loser must lose cleanly: '.json_encode($unexpected));
        $this->assertCount(1, $winners, 'exactly one of the four gets the slot: '.json_encode($results));
        $this->assertSame(1, DB::table('appointments')->count());
        $this->assertSame(8, DB::table('appointment_slots')->count(), 'one appointment: 30 minutes plus its buffer in 5-minute cells');
        $this->assertSame($winners[0]['id'], DB::table('appointments')->value('id'));
    }

    public function test_overlapping_times_booked_at_once_also_produce_only_one_and_a_free_one_is_not_blocked_by_them()
    {
        // 10:00, 10:30 and 09:30 all overlap each other (the buffer after one runs into the next); 14:00 is on its own.
        $results = $this->raceUntilSomeoneWins(['2026-11-02 10:00', '2026-11-02 10:30', '2026-11-02 09:30', '2026-11-02 14:00'], 3);

        $overlapping = array_slice($results, 0, 3);
        $alone = $results[3];

        $this->assertSame([], array_values(array_filter($results, fn ($r) => $r['ok'] === false && ! $this->isCleanLoss($r))), json_encode($results));
        $this->assertCount(1, array_filter($overlapping, fn ($r) => $r['ok'] === true), 'only one of the overlapping three: '.json_encode($results));

        $expected = 1 + ($alone['ok'] === true ? 1 : 0);
        $this->assertSame($expected, DB::table('appointments')->count());
        $this->assertSame($expected * 8, DB::table('appointment_slots')->count());

        // Whatever happened, no two appointments share a cell (the unique index) and none overlaps another in time.
        $starts = DB::table('appointments')->orderBy('starts_at')->pluck('starts_at')->map(fn ($s) => strtotime((string) $s.' UTC'))->all();

        for ($i = 1; $i < count($starts); $i++) {
            $this->assertGreaterThanOrEqual(40 * 60, $starts[$i] - $starts[$i - 1], 'two appointments closer than a visit plus its buffer');
        }
    }
}
