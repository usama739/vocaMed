<?php

use App\Http\Controllers\LocaleController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::inertia('/', 'welcome')->name('home');

Route::post('locale', [LocaleController::class, 'update'])->name('locale.update');

// Public pages that only render UI for now. Sign-in, sign-up, forgot and reset password are
// rendered by Fortify's views (see FortifyServiceProvider) with the same component names.
Route::inertia('privacy', 'privacy')->name('privacy');
Route::get('invite/{token}', fn (string $token) => Inertia::render('auth/invite', ['token' => $token]))
    ->name('invite');

// Where a successful sign-in lands until the role areas are built. No access control yet.
Route::inertia('admin', 'placeholder', ['role' => 'clinic_admin'])->name('placeholder.admin');
Route::inertia('doctor', 'placeholder', ['role' => 'doctor'])->name('placeholder.doctor');

// Receptionist console. UI only for now: each route just renders its page, with no access control yet.
Route::prefix('reception')->name('reception.')->group(function () {
    Route::inertia('/', 'reception/today')->name('today');
    Route::inertia('appointments', 'reception/appointments')->name('appointments');
    Route::get('appointments/{id}', fn (string $id) => Inertia::render('reception/appointment', ['id' => $id]))
        ->name('appointment');
    Route::inertia('calendar', 'reception/calendar')->name('calendar');
    Route::inertia('patients', 'reception/patients')->name('patients');
    Route::get('patients/{id}', fn (string $id) => Inertia::render('reception/patient', ['id' => $id]))
        ->name('patient');
    Route::inertia('notifications', 'reception/notifications')->name('notifications');
});

// Developer preview of the shared components (en + ur). Not available in production.
if (app()->environment(['local', 'testing'])) {
    Route::inertia('components', 'components')->name('components');
}

Route::middleware(['auth', 'verified'])->group(function () {
    Route::inertia('dashboard', 'dashboard')->name('dashboard');
});

require __DIR__.'/settings.php';
