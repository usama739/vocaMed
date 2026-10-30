<?php

use App\Exceptions\JsonErrorMapper;
use App\Http\Middleware\EnsureAccountIsActive;
use App\Http\Middleware\EnsureStaffRole;
use App\Http\Middleware\HandleAppearance;
use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\SetLocale;
use App\Http\Middleware\SetTenantContext;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Illuminate\Http\Request;
use Illuminate\Routing\Middleware\SubstituteBindings;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->encryptCookies(except: ['appearance', 'sidebar_state', 'locale']);

        // Someone already signed in who opens a guest page (sign-in, sign-up) goes to their own area instead.
        $middleware->redirectUsersTo(fn (Request $request) => $request->user()?->role?->home() ?? '/');

        // Before route binding, so a record of another clinic in the URL is simply not found.
        $middleware->prependToPriorityList(before: SubstituteBindings::class, prepend: SetTenantContext::class);

        // The role guard also answers before binding, so a person who may not use an area is told so (401 or 403) rather
        // than learning whether a record exists (404).
        $middleware->prependToPriorityList(before: SubstituteBindings::class, prepend: EnsureStaffRole::class);

        $middleware->web(append: [
            // A signed-in person who has since been deactivated, or whose clinic was suspended, is sent away.
            EnsureAccountIsActive::class,
            // The signed-in person's clinic becomes the one every clinic query is limited to.
            SetTenantContext::class,
            SetLocale::class,
            HandleAppearance::class,
            HandleInertiaRequests::class,
            AddLinkHeadersForPreloadedAssets::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        $exceptions->render(new JsonErrorMapper);
    })->create();
