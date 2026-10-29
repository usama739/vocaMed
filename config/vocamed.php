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
    | Real sign-in for the staff pages
    |--------------------------------------------------------------------------
    |
    | The same switch as the frontend's VITE_REAL_AUTH. On: /admin, /reception, /doctor and /account need a
    | signed-in person and the pages read who they are from the session. Off: the open demo on mock data
    | (also what the browser specs use). Goes away in F4, when access control is always on.
    |
    */

    'real_auth' => (bool) env('VITE_REAL_AUTH', false),

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

];
