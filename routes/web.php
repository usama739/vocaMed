<?php

use App\Http\Controllers\Auth\ConfirmEmailController;
use App\Http\Controllers\Auth\DemoRequestController;
use App\Http\Controllers\Auth\InvitationController;
use App\Http\Controllers\Auth\PasswordResetStatusController;
use App\Http\Controllers\Auth\SignUpController;
use App\Http\Controllers\DevInboxController;
use App\Http\Controllers\LocaleController;
use App\Http\Middleware\RequireSignInWhenReal;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::inertia('/', 'welcome')->name('home');

Route::post('locale', [LocaleController::class, 'update'])->name('locale.update');

// Sign-in, forgot and reset password are Fortify's routes (see FortifyServiceProvider); the pages are the same.
// Sign-up is ours, behind vocamed.self_service_signup, and opens the workspace only after the emailed link is followed.
Route::get('register', [SignUpController::class, 'create'])->middleware('guest')->name('register');
Route::post('register', [SignUpController::class, 'store'])->middleware(['guest', 'throttle:5,1,signup'])->name('register.store');
Route::get('register/confirm/{user}/{hash}', ConfirmEmailController::class)
    ->middleware(['signed', 'throttle:6,1,confirm'])
    ->name('register.confirm');

// Does this reset link still work? (JSON, for the reset page.)
Route::get('reset-password/{token}/status', PasswordResetStatusController::class)
    ->middleware('throttle:20,1,reset-status')
    ->name('password.status');

Route::inertia('privacy', 'privacy')->name('privacy');
Route::post('demo-requests', [DemoRequestController::class, 'store'])->middleware('throttle:5,1,demo')->name('demo-requests.store');

// Staff invitations: the page, then JSON for what it shows and for accepting.
Route::get('invite/{token}', fn (string $token) => Inertia::render('auth/invite', ['token' => $token]))
    ->name('invite');
Route::get('invitations/{token}', [InvitationController::class, 'show'])->middleware('throttle:30,1,invitation-show')->name('invitations.show');
Route::post('invitations/{token}/accept', [InvitationController::class, 'accept'])->middleware('throttle:10,1,invitation-accept')->name('invitations.accept');

// Patient link pages: no sign-in, one appointment, reached from the message the patient received.
// UI only for now; the token is passed to the page as it arrives.
Route::prefix('p/{token}')->name('patient.')->group(function () {
    Route::get('/', fn (string $token) => Inertia::render('patient/manage', ['token' => $token]))->name('manage');
    Route::get('reschedule', fn (string $token) => Inertia::render('patient/reschedule', ['token' => $token]))->name('reschedule');
    Route::get('status', fn (string $token) => Inertia::render('patient/status', ['token' => $token]))->name('status');
    Route::get('expired', fn (string $token) => Inertia::render('patient/expired', ['token' => $token]))->name('expired');
});

// Staff pages. With real sign-in on (config vocamed.real_auth) they need a signed-in person; off, they are the
// open demo. Role-based access control comes in F4.
Route::middleware(RequireSignInWhenReal::class)->group(function () {
    // The signed-in person's own account, shared by every staff role. UI only for now: no access control yet.
    Route::inertia('account', 'account')->name('account');

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
});

// Developer preview of the shared components (en + ur). Not available in production.
if (app()->environment(['local', 'testing'])) {
    Route::inertia('components', 'components')->name('components');
}

// Developer inbox: the emails the app sent on this machine (sign-up confirmation, password reset). Local only.
if (app()->environment(['local', 'testing'])) {
    Route::get('dev/inbox', [DevInboxController::class, 'index'])->name('dev.inbox');
    Route::post('dev/inbox/clear', [DevInboxController::class, 'clear'])->name('dev.inbox.clear');
}
