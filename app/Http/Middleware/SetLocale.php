<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Illuminate\Support\Facades\View;
use Symfony\Component\HttpFoundation\Response;

class SetLocale
{
    /**
     * Supported UI locales mapped to their text direction.
     *
     * @var array<string, 'ltr'|'rtl'>
     */
    public const LOCALES = [
        'en' => 'ltr',
        'ur' => 'rtl',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        $cookie = $request->cookie('locale');
        $locale = is_string($cookie) && array_key_exists($cookie, self::LOCALES)
            ? $cookie
            : config('app.locale');

        App::setLocale($locale);

        View::share('direction', self::LOCALES[$locale] ?? 'ltr');

        return $next($request);
    }
}
