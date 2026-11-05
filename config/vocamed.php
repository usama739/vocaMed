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

    /*
    |--------------------------------------------------------------------------
    | Voice booking
    |--------------------------------------------------------------------------
    |
    | A spoken (or typed) request goes through two drivers: speech to text, then text to the fields of a booking. Each is a setting,
    | so moving from a free provider to a paid one, or to our own server, changes the environment file and no code. Both start on
    | "fake" (fixed answers, no network). A recording is kept only as an encrypted file on a private disk until it has been
    | transcribed. A recording may be at most `max_seconds` long and `max_kilobytes` large, and a typed request `max_text_characters`.
    |
    | `limits` are requests a minute: per person, per clinic, and for the whole system (`global`, kept under the free provider's own
    | 20 a minute so a busy moment answers politely instead of showing the provider's error). `poll` is how often one person's screen
    | may ask "is it ready?".
    |
    */

    'voice' => [
        'speech_driver' => env('SPEECH_DRIVER', 'fake'),
        'intent_driver' => env('INTENT_DRIVER', 'rules'),
        'disk' => env('VOICE_DISK', 'local'),
        'max_seconds' => 15,
        'max_kilobytes' => 1024,
        'max_text_characters' => 500,

        // What is kept, and for how long. A recording is deleted as soon as it has been read unless the clinic chose to keep recordings
        // (Settings, "Keep voice audio for": 7 or 30 days); a recording the queue never got to is deleted once it is `stale_audio_hours`
        // old. The written transcript and what was understood are kept `transcript_days` days, then erased (the row stays, so use can still
        // be counted). `php artisan voice:purge` does this and runs daily.
        'stale_audio_hours' => 1,
        'transcript_days' => 30,
        'limits' => ['user' => 10, 'clinic' => 40, 'global' => 15, 'poll' => 200, 'llm_minute' => 10, 'llm_day' => 900],

        // The speech provider (driver "whisper_http"): any OpenAI-compatible audio API. Groq's free Whisper now; OpenAI's, or our own server,
        // later by changing these three settings. `language` is an ISO code such as "ur" or "en" and is only a hint; empty lets the provider
        // work it out. `prompt_characters` caps the doctor and service names sent as spelling hints (the provider allows 224 tokens).
        'speech' => [
            'base_url' => env('SPEECH_BASE_URL', 'https://api.groq.com/openai/v1'),
            'api_key' => env('SPEECH_API_KEY'),
            'model' => env('SPEECH_MODEL', 'whisper-large-v3-turbo'),
            'language' => env('SPEECH_LANGUAGE'),
            'timeout' => 30,
            'prompt_characters' => 500,
        ],

        // The optional language-model parser (drivers "llm" and "rules_llm"): any OpenAI-compatible chat API that can answer in a JSON
        // schema. It sends the request's text to that provider, so it is off unless INTENT_DRIVER names it.
        'intent' => [
            'base_url' => env('INTENT_BASE_URL', 'https://api.groq.com/openai/v1'),
            'api_key' => env('INTENT_API_KEY', env('SPEECH_API_KEY')),
            'model' => env('INTENT_MODEL', 'openai/gpt-oss-20b'),
            'timeout' => 20,
        ],

        // What the speech provider's free tier allows, kept a little under its own limits so a busy hour answers "try again" here instead
        // of an error from the provider: audio seconds an hour and a day, and requests a day. A recording under `billed_minimum_seconds`
        // is billed as that long. Not applied to the fake driver. Raise or set to 0 (no limit) when the provider is a paid one.
        'budget' => [
            'audio_seconds_hour' => (int) env('SPEECH_SECONDS_PER_HOUR', 7000),
            'audio_seconds_day' => (int) env('SPEECH_SECONDS_PER_DAY', 28000),
            'requests_day' => (int) env('SPEECH_REQUESTS_PER_DAY', 1900),
            'billed_minimum_seconds' => 10,
        ],

        // What the fake drivers answer; tests and a developer without a provider change these.
        'fake_transcript' => 'Book Ayesha Khan with Dr. Sana tomorrow at ten',
        'fake_intent' => [
            'kind' => 'book',
            'patientName' => 'Ayesha Khan',
            'patientPhone' => null,
            'doctorName' => 'Dr. Sana',
            'serviceName' => null,
            'date' => null,
            'time' => '10:00',
        ],
    ],

];
