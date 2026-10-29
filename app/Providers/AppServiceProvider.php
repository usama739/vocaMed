<?php

namespace App\Providers;

use App\Authorization\Ability;
use App\Authorization\OwnedByStaff;
use App\Authorization\Permissions;
use App\Listeners\RecordDevMail;
use App\Models\User;
use App\Support\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Notifications\Events\NotificationSent;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // One per request or queued job: which clinic the code is acting for.
        $this->app->scoped(TenantContext::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureDefaults();
        $this->defineAbilities();

        // Six tries a minute per person to confirm a password on the Account page (change password, sign out others).
        RateLimiter::for('account-sensitive', fn (Request $request) => Limit::perMinute(6)->by('account:'.(Auth::id() ?? $request->ip())));

        // On a developer machine the emails the app sends are readable at /dev/inbox.
        if (app()->environment(['local', 'testing'])) {
            Event::listen(NotificationSent::class, RecordDevMail::class);
        }
    }

    /**
     * One gate per row of the permission table (`Gate::allows('staff.manage')`, `$this->authorize('appointments.view', $appointment)`).
     * A record that must be the person's own is passed as the second argument.
     */
    protected function defineAbilities(): void
    {
        foreach (Ability::cases() as $ability) {
            Gate::define(
                $ability->value,
                fn (User $user, ?OwnedByStaff $subject = null): bool => Permissions::allows($user, $ability, $subject),
            );
        }
    }

    /**
     * Configure default behaviors for production-ready applications.
     */
    protected function configureDefaults(): void
    {
        Date::use(CarbonImmutable::class);

        DB::prohibitDestructiveCommands(
            app()->isProduction(),
        );

        // The rule every password field shows (10 or more characters with letters and numbers), enforced here
        // as well so a request that skips the page is held to it.
        Password::defaults(fn (): Password => Password::min(10)->letters()->numbers());
    }
}
