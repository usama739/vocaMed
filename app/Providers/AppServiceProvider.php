<?php

namespace App\Providers;

use App\Listeners\RecordDevMail;
use App\Support\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Notifications\Events\NotificationSent;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
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

        // On a developer machine the emails the app sends are readable at /dev/inbox.
        if (app()->environment(['local', 'testing'])) {
            Event::listen(NotificationSent::class, RecordDevMail::class);
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
