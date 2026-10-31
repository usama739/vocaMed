<?php

namespace App\Providers;

use App\Authorization\Ability;
use App\Authorization\OwnedByStaff;
use App\Authorization\Permissions;
use App\Booking\BookingIntakeManager;
use App\Booking\CacheSlotHolds;
use App\Booking\Contracts\SlotHolds;
use App\Listeners\RecordDevMail;
use App\Listeners\RecordSignIn;
use App\Models\User;
use App\PatientLinks\Contracts\PatientLinkDelivery;
use App\PatientLinks\LogPatientLinkDelivery;
use App\Support\ActingAs;
use App\Support\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Auth\Events\Login;
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

        // One per request: whether the patient who opened a link is the one acting (the audit reads it).
        $this->app->scoped(ActingAs::class);

        // How a new patient link reaches the patient: only logged on a developer machine until the messages step.
        $this->app->bind(PatientLinkDelivery::class, LogPatientLinkDelivery::class);

        // Where slot holds are kept (the cache store is a setting); swap the class to change how holds work.
        $this->app->bind(SlotHolds::class, CacheSlotHolds::class);

        // How bookings are requested (typed now, voice later): the driver is a setting, the engine does not know which.
        $this->app->singleton(BookingIntakeManager::class);
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

        // Patient search is limited so the clinic's list cannot be scraped quickly: 120 requests a minute per person.
        RateLimiter::for('patient-search', fn (Request $request) => Limit::perMinute(120)->by('patient-search:'.(Auth::id() ?? $request->ip())));

        // Finding and holding slots: 240 requests a minute per person (a booking panel polls while it is open).
        RateLimiter::for('booking', fn (Request $request) => Limit::perMinute(240)->by('booking:'.(Auth::id() ?? $request->ip())));

        // Patient links are public (the token is the credential), so each address is slowed down: pages 60 a minute, actions 20, and
        // "send me a new link" 3 for one link from one address.
        RateLimiter::for('patient-link', fn (Request $request) => Limit::perMinute(60)->by('patient-link:'.$request->ip()));
        RateLimiter::for('patient-link-action', fn (Request $request) => Limit::perMinute(20)->by('patient-link-action:'.$request->ip()));
        RateLimiter::for('patient-link-request', fn (Request $request) => Limit::perMinute(3)->by('patient-link-request:'.$request->ip().':'.hash('sha256', (string) $request->route('token'))));

        Event::listen(Login::class, RecordSignIn::class);

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
