<?php

namespace App\Http\Controllers;

use App\Http\Middleware\SetLocale;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cookie;
use Illuminate\Validation\Rule;

class LocaleController extends Controller
{
    public function update(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'locale' => ['required', Rule::in(array_keys(SetLocale::LOCALES))],
        ]);

        return back()->withCookie(Cookie::make('locale', $data['locale'], 60 * 24 * 365, httpOnly: false));
    }
}
