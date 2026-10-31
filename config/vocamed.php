<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Self-service clinic sign-up
    |--------------------------------------------------------------------------
    |
    | Whether anyone may open a clinic from the sign-up page. On while developing; off by default in
    | production, where clinics are opened with `php artisan clinic:create` until this is decided.
    | When off, the sign-up page sends people to the landing page ("Request a demo").
    |
    */

    'self_service_signup' => (bool) env('VOCAMED_SELF_SERVICE_SIGNUP', env('APP_ENV') !== 'production'),

    /*
    |--------------------------------------------------------------------------
    | Real sign-in and role access for the staff pages
    |--------------------------------------------------------------------------
    |
    | The same switch as the frontend's VITE_REAL_AUTH. On: /admin, /reception, /doctor and /account need a
    | signed-in person of the right role, and the pages read who they are from the session. Off: the open demo on
    | mock data (what the browser specs use). Always on in production, whatever the environment file says.
    |
    */

    'real_auth' => env('APP_ENV') === 'production' || (bool) env('VITE_REAL_AUTH', false),

    /*
    |--------------------------------------------------------------------------
    | Invitations
    |--------------------------------------------------------------------------
    */

    'invitation_days' => 7,

    /*
    |--------------------------------------------------------------------------
    | Sign-up email confirmation
    |--------------------------------------------------------------------------
    |
    | How long the link in the "confirm your address" email stays valid, in hours.
    |
    */

    'confirmation_hours' => 24,

    /*
    |--------------------------------------------------------------------------
    | Phone country codes
    |--------------------------------------------------------------------------
    |
    | A clinic's country (ISO code) gives the code that a number typed with a leading 0 is completed with.
    | Add a country here before a clinic in it is opened.
    |
    */

    'calling_codes' => [
        'PK' => '+92',
        'IN' => '+91',
        'AE' => '+971',
        'SA' => '+966',
        'GB' => '+44',
        'US' => '+1',
    ],

    /*
    |--------------------------------------------------------------------------
    | Clinic setting choices
    |--------------------------------------------------------------------------
    |
    | The values the Settings page offers; the server accepts nothing else.
    |
    */

    'reminder_hours_options' => [48, 24, 12, 4, 2, 1],
    'cancellation_window_options' => [1, 2, 4, 24],
    'voice_retention_options' => [0, 7, 30],

    /*
    |--------------------------------------------------------------------------
    | Slot holds
    |--------------------------------------------------------------------------
    |
    | A hold is the two-minute "someone is booking this slot" a receptionist places while filling the booking panel. It lives
    | in a cache store, never in the database tables the bookings use, so the no-double-booking guarantee never depends on it.
    | The store is the database cache today; set HOLDS_CACHE_STORE=redis (with a Redis server and the predis package) to move
    | it to Redis with no code change.
    |
    */

    'holds_store' => env('HOLDS_CACHE_STORE', 'database'),

    'hold_seconds' => 120,

    /*
    |--------------------------------------------------------------------------
    | How a booking is requested
    |--------------------------------------------------------------------------
    |
    | The intake driver turns what a person typed (or, later, said) into the booking request the engine understands.
    | "typed" is the booking panel; "voice" is added in the voice step.
    |
    */

    'booking_intake' => env('BOOKING_INTAKE', 'typed'),

    /*
    |--------------------------------------------------------------------------
    | Messages to patients
    |--------------------------------------------------------------------------
    |
    | Each channel a patient can choose is sent by a driver: "mail" really sends through Laravel's mail (whatever MAIL_MAILER
    | says), "log" only writes the message to the log and sends nothing. SMS and WhatsApp stay on "log" until a provider is
    | chosen; a provider is one new driver class and one value here. A reminder is sent when its hour comes round, and never
    | more than this many minutes late (so a scheduler that was off does not send yesterday's 24-hour reminder this morning).
    |
    */

    'messages' => [
        'drivers' => [
            'email' => env('MESSAGES_EMAIL_DRIVER', 'mail'),
            'sms' => env('MESSAGES_SMS_DRIVER', 'log'),
            'whatsapp' => env('MESSAGES_WHATSAPP_DRIVER', 'log'),
        ],
        'reminder_grace_minutes' => 60,
    ],

];
