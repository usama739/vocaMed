<?php

namespace Tests\Feature\Voice;

use Tests\TestCase;

/** `php artisan voice:evaluate`: the way the parser is measured on the phrase sets, and the gate a build can use. */
class VoiceEvaluateCommandTest extends TestCase
{
    public function test_the_tuned_set_passes_a_perfect_bar_and_prints_every_field_and_language()
    {
        $this->artisan('voice:evaluate', ['--set' => 'phrases', '--min' => 1])
            ->expectsOutputToContain('phrases: ')
            ->expectsOutputToContain('patientName')
            ->expectsOutputToContain('roman')
            ->assertExitCode(0);
    }

    public function test_the_held_out_set_clears_the_floor_the_tests_hold_it_to()
    {
        $this->artisan('voice:evaluate', ['--set' => 'holdout', '--min' => 0.8])->assertExitCode(0);
    }

    public function test_a_bar_that_is_not_met_fails_the_command_so_a_build_can_stop_on_it()
    {
        $this->artisan('voice:evaluate', ['--set' => 'all', '--min' => 1.01])->assertExitCode(1);
    }

    public function test_an_unknown_set_is_refused()
    {
        $this->artisan('voice:evaluate', ['--set' => 'nonsense'])->expectsOutputToContain('--set must be')->assertExitCode(2);
    }
}
