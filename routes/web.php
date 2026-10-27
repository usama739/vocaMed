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

// Patient link pages: no sign-in, one appointment, reached from the message the patient received.
// UI only for now; the token is passed to the page as it arrives.
Route::prefix('p/{token}')->name('patient.')->group(function () {
    Route::get('/', fn (string $token) => Inertia::render('patient/manage', ['token' => $token]))->name('manage');
    Route::get('reschedule', fn (string $token) => Inertia::render('patient/reschedule', ['token' => $token]))->name('reschedule');
    Route::get('status', fn (string $token) => Inertia::render('patient/status', ['token' => $token]))->name('status');
    Route::get('expired', fn (string $token) => Inertia::render('patient/expired', ['token' => $token]))->name('expired');
});

// Clinic admin. UI only for now: each route just renders its page, with no access control yet.
Route::prefix('admin')->name('admin.')->group(function () {
    Route::inertia('/', 'admin/overview')->name('overview');
    Route::inertia('doctors', 'admin/doctors')->name('doctors');
    // `new` is the blank form for a doctor who does not exist yet.
    Route::get('doctors/{id}', fn (string $id) => Inertia::render('admin/doctor', ['id' => $id]))
        ->name('doctor');
    Route::inertia('staff', 'admin/staff')->name('staff');
    Route::inertia('services', 'admin/services')->name('services');
    Route::inertia('settings', 'admin/settings')->name('settings');
    Route::inertia('templates', 'admin/templates')->name('templates');
    Route::inertia('audit', 'admin/audit')->name('audit');
});

// Doctor workspace. UI only for now: each route just renders its page, with no access control yet.
Route::prefix('doctor')->name('doctor.')->group(function () {
    Route::inertia('/', 'doctor/overview')->name('overview');
    Route::inertia('schedule', 'doctor/schedule')->name('schedule');
    Route::inertia('availability', 'doctor/availability')->name('availability');
    Route::inertia('requests', 'doctor/requests')->name('requests');
});

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
