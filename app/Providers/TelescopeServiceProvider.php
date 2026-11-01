<?php

namespace App\Providers;

use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Gate;
use Laravel\Telescope\EntryType;
use Laravel\Telescope\IncomingEntry;
use Laravel\Telescope\Telescope;
use Laravel\Telescope\TelescopeApplicationServiceProvider;

/**
 * A developer's window into the app (`/telescope`): requests, queries, jobs, mail, logs, exceptions, events. Registered only on a
 * developer machine (see AppServiceProvider), so it is never part of a deployed clinic.
 */
class TelescopeServiceProvider extends TelescopeApplicationServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->hideSensitiveRequestDetails();

        // Every staff screen asks the server again every few seconds. A successful read like that is not worth keeping (it would
        // bury the interesting entries and slow the database); errors, failed jobs and everything that is not such a read are.
        Telescope::filterBatch(function (Collection $entries): bool {
            if ($entries->contains(fn (IncomingEntry $entry) => $entry->isReportableException() || $entry->isFailedJob() || $entry->isFailedRequest())) {
                return true;
            }

            $request = $entries->first(fn (IncomingEntry $entry) => $entry->type === EntryType::REQUEST);

            if ($request === null) {
                return true;
            }

            $accept = strtolower((string) ($request->content['headers']['accept'] ?? ''));

            return ! (($request->content['method'] ?? '') === 'GET' && str_contains($accept, 'json'));
        });
    }

    /**
     * Passwords, tokens and cookies never reach Telescope's tables, even on a developer machine.
     */
    protected function hideSensitiveRequestDetails(): void
    {
        Telescope::hideRequestParameters(['_token', 'password', 'password_confirmation', 'current_password', 'token']);

        Telescope::hideRequestHeaders([
            'cookie',
            'set-cookie',
            'x-csrf-token',
            'x-xsrf-token',
        ]);
    }

    /**
     * Register the Telescope gate. Telescope only runs on a developer machine, where it is open; this nobody passes elsewhere.
     */
    protected function gate(): void
    {
        Gate::define('viewTelescope', fn (?User $user = null): bool => false);
    }
}
