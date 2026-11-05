<?php

namespace App\Console\Commands;

use App\Voice\VoicePurger;
use Illuminate\Console\Command;

/**
 * The daily sweep of voice requests: deletes recordings that are past what their clinic chose to keep (or were stranded by a queue that was
 * down) and erases transcripts older than 30 days. It runs every night (`schedule:work` in development) and is safe to run by hand.
 */
class VoicePurgeCommand extends Command
{
    protected $signature = 'voice:purge';

    protected $description = 'Delete old voice recordings and erase old transcripts';

    public function handle(VoicePurger $purger): int
    {
        $counts = $purger->sweep();

        $this->info(sprintf('Deleted %d recording(s) and erased %d transcript(s).', $counts['recordings'], $counts['transcripts']));

        return self::SUCCESS;
    }
}
