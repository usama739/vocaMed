<?php

use App\Enums\Role;
use App\Http\Controllers\AccountController;
use App\Http\Controllers\Admin\AuditController;
use App\Http\Controllers\Admin\DoctorsController;
use App\Http\Controllers\Admin\ServicesController;
use App\Http\Controllers\Admin\SettingsController;
use App\Http\Controllers\Admin\StaffController;
use App\Http\Controllers\Admin\TemplatesController;
use App\Http\Controllers\Api\AppointmentsController;
use App\Http\Controllers\Api\AvailabilityController as BookingAvailabilityController;
use App\Http\Controllers\Api\LookupsController;
use App\Http\Controllers\Api\SlotHoldsController;
use App\Http\Controllers\Auth\ConfirmEmailController;
use App\Http\Controllers\Auth\DemoRequestController;
use App\Http\Controllers\Auth\InvitationController;
use App\Http\Controllers\Auth\PasswordResetStatusController;
use App\Http\Controllers\Auth\SignUpController;
use App\Http\Controllers\DevInboxController;
use App\Http\Controllers\Doctor\AvailabilityController;
use App\Http\Controllers\LocaleController;
use App\Http\Controllers\PatientsController;
use App\Http\Controllers\Reception\ReceptionController;
use App\Http\Middleware\EnsureStaffRole;
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

// Staff areas. Each is guarded by role (EnsureStaffRole): not signed in goes to the sign-in page, another role's area
// is refused (403 for JSON, a redirect to the person's own area for a page). The guard applies while real sign-in is on
// (config vocamed.real_auth, always on in production); off, the pages are the open demo on mock data. A test fails if
// a route outside the public list has no guard.

// The signed-in person's own account, shared by every staff role.
Route::middleware(EnsureStaffRole::for())->prefix('account')->group(function () {
    Route::get('/', [AccountController::class, 'show'])->name('account');
    Route::patch('/', [AccountController::class, 'update'])->name('account.update');
    Route::patch('notifications', [AccountController::class, 'notifications'])->name('account.notifications');
    // Both confirm the current password, so they share one allowance of wrong guesses.
    Route::put('password', [AccountController::class, 'password'])->middleware('throttle:account-sensitive')->name('account.password');
    Route::post('sessions/logout-others', [AccountController::class, 'signOutOthers'])->middleware('throttle:account-sensitive')->name('account.sessions.logout-others');
});

// Clinic admin.
Route::middleware(EnsureStaffRole::for(Role::ClinicAdmin))->prefix('admin')->name('admin.')->group(function () {
    Route::inertia('/', 'admin/overview')->name('overview');
    Route::get('doctors', [DoctorsController::class, 'index'])->name('doctors');
    Route::post('doctors', [DoctorsController::class, 'store'])->name('doctors.store');
    // `new` is the blank form for a doctor who does not exist yet.
    Route::get('doctors/{id}', [DoctorsController::class, 'show'])->name('doctor');
    Route::put('doctors/{doctor}', [DoctorsController::class, 'update'])->name('doctors.update');
    Route::patch('doctors/{doctor}', [DoctorsController::class, 'toggle'])->name('doctors.toggle');
    Route::post('doctors/{doctorId}/availability/preview', [DoctorsController::class, 'preview'])->name('doctors.availability.preview');
    Route::put('doctors/{doctor}/availability', [DoctorsController::class, 'saveAvailability'])->name('doctors.availability');
    Route::post('doctors/{doctor}/invite', [DoctorsController::class, 'invite'])->name('doctors.invite');
    Route::get('staff', [StaffController::class, 'index'])->name('staff');
    Route::post('staff/invite', [StaffController::class, 'invite'])->name('staff.invite');
    Route::post('staff/{invitation}/resend', [StaffController::class, 'resend'])->name('staff.resend');
    Route::delete('staff/{invitation}/invite', [StaffController::class, 'revoke'])->name('staff.revoke');
    Route::patch('staff/{id}/deactivate', [StaffController::class, 'setActive'])->name('staff.deactivate');
    Route::get('services', [ServicesController::class, 'index'])->name('services');
    Route::post('services', [ServicesController::class, 'store'])->name('services.store');
    Route::put('services/{service}', [ServicesController::class, 'update'])->name('services.update');
    Route::patch('services/{service}', [ServicesController::class, 'toggle'])->name('services.toggle');
    Route::get('settings', [SettingsController::class, 'show'])->name('settings');
    Route::put('settings', [SettingsController::class, 'update'])->name('settings.update');
    Route::get('templates', [TemplatesController::class, 'index'])->name('templates');
    Route::put('templates', [TemplatesController::class, 'update'])->name('templates.update');
    Route::delete('templates', [TemplatesController::class, 'destroy'])->name('templates.destroy');
    Route::post('templates/test', [TemplatesController::class, 'test'])->name('templates.test');
    Route::get('audit', [AuditController::class, 'index'])->name('audit');
});

// Doctor workspace.
Route::middleware(EnsureStaffRole::for(Role::Doctor))->prefix('doctor')->name('doctor.')->group(function () {
    Route::inertia('/', 'doctor/overview')->name('overview');
    Route::inertia('schedule', 'doctor/schedule')->name('schedule');
    Route::get('availability', [AvailabilityController::class, 'show'])->name('availability');
    Route::put('availability', [AvailabilityController::class, 'save'])->name('availability.save');
    Route::post('availability/preview', [AvailabilityController::class, 'preview'])->name('availability.preview');
    Route::inertia('requests', 'doctor/requests')->name('requests');
});

// Receptionist console.
Route::middleware(EnsureStaffRole::for(Role::Receptionist))->prefix('reception')->name('reception.')->group(function () {
    // Each page is the Inertia page; the same address asked for JSON is that page's read model.
    Route::get('/', [ReceptionController::class, 'today'])->name('today');
    Route::get('appointments', [ReceptionController::class, 'appointments'])->name('appointments');
    Route::get('appointments/{id}', [ReceptionController::class, 'appointment'])->name('appointment');
    Route::get('calendar', [ReceptionController::class, 'calendar'])->name('calendar');
    Route::get('patients', [ReceptionController::class, 'patients'])->name('patients');
    Route::get('patients/{id}', [ReceptionController::class, 'patient'])->name('patient');
    Route::inertia('notifications', 'reception/notifications')->name('notifications');
});

// The clinic's patients (booking panel, Patients page): JSON for both roles that book, behind the ability check.
Route::middleware(EnsureStaffRole::for(Role::ClinicAdmin, Role::Receptionist))->prefix('api/patients')->name('api.patients.')->group(function () {
    Route::get('search', [PatientsController::class, 'search'])->middleware('throttle:patient-search')->name('search');
    Route::get('recent', [PatientsController::class, 'recent'])->name('recent');
    Route::post('/', [PatientsController::class, 'store'])->name('store');
    Route::get('{patient}', [PatientsController::class, 'show'])->name('show');
    Route::patch('{patient}', [PatientsController::class, 'update'])->name('update');
});

// Appointments. Reading and moving through the day is for every staff role (the policy narrows a doctor to their own);
// booking, moving and cancelling is for the people who run the desk.
Route::middleware(EnsureStaffRole::for())->prefix('api/appointments')->name('api.appointments.')->group(function () {
    Route::get('/', [AppointmentsController::class, 'index'])->name('index');
    Route::get('{appointment}', [AppointmentsController::class, 'show'])->name('show');
    Route::patch('{appointment}/status', [AppointmentsController::class, 'status'])->name('status');
});
Route::middleware(EnsureStaffRole::for(Role::ClinicAdmin, Role::Receptionist))->prefix('api/appointments')->name('api.appointments.')->group(function () {
    Route::post('/', [AppointmentsController::class, 'store'])->middleware('throttle:booking')->name('store');
    Route::patch('{appointment}/reschedule', [AppointmentsController::class, 'reschedule'])->name('reschedule');
    Route::post('{appointment}/cancel', [AppointmentsController::class, 'cancel'])->name('cancel');
});

// What every staff screen needs to show names and options (the clinic, doctors, services, a doctor's hours). Read only.
Route::middleware(EnsureStaffRole::for())->prefix('api')->name('api.')->group(function () {
    Route::get('clinic', [LookupsController::class, 'clinic'])->name('clinic');
    Route::get('doctors', [LookupsController::class, 'doctors'])->name('doctors');
    Route::get('doctors/{doctor}', [LookupsController::class, 'doctor'])->name('doctor');
    Route::get('doctors/{doctor}/availability', [LookupsController::class, 'availability'])->name('doctor.availability');
    Route::get('doctors/{doctor}/next-free', [LookupsController::class, 'nextFree'])->name('doctor.next-free');
    Route::get('services', [LookupsController::class, 'services'])->name('services');
});

// Finding and holding a slot for the people who book (admin and receptionist).
Route::middleware(EnsureStaffRole::for(Role::ClinicAdmin, Role::Receptionist))->prefix('api')->name('api.')->group(function () {
    Route::get('availability', [BookingAvailabilityController::class, 'index'])->middleware('throttle:booking')->name('availability');
    Route::get('availability/alternatives', [BookingAvailabilityController::class, 'alternatives'])->middleware('throttle:booking')->name('availability.alternatives');
    Route::post('slot-holds', [SlotHoldsController::class, 'store'])->middleware('throttle:booking')->name('holds.store');
    Route::get('slot-holds', [SlotHoldsController::class, 'index'])->name('holds.index');
    Route::delete('slot-holds/{holdId}', [SlotHoldsController::class, 'destroy'])->name('holds.destroy');
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
