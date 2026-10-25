<?php

use App\Http\Controllers\LocaleController;
use Illuminate\Support\Facades\Route;

Route::inertia('/', 'welcome')->name('home');

Route::post('locale', [LocaleController::class, 'update'])->name('locale.update');

// Developer preview of the shared components (en + ur). Not available in production.
if (app()->environment(['local', 'testing'])) {
    Route::inertia('components', 'components')->name('components');
}

Route::middleware(['auth', 'verified'])->group(function () {
    Route::inertia('dashboard', 'dashboard')->name('dashboard');
});

require __DIR__.'/settings.php';
