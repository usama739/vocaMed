<?php

namespace App\Data;

use App\Models\User;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

/**
 * Everything needed to open a clinic with its first admin. The Artisan command and the sign-up page
 * both build one of these, so the rules and the result are the same whichever way a clinic is created.
 */
final readonly class NewClinic
{
    public function __construct(
        public string $clinicName,
        public string $country,
        public string $timezone,
        public string $locale,
        public string $adminName,
        public string $adminEmail,
        public string $adminPassword,
    ) {}

    /**
     * The input keys match the sign-up form: clinic, country, timezone, locale, name, email, password.
     *
     * @return array<string, array<int, mixed>>
     */
    public static function rules(): array
    {
        return [
            'clinic' => ['required', 'string', 'max:255'],
            'country' => ['required', 'string', 'size:2', 'alpha'],
            'timezone' => ['required', 'string', 'timezone:all'],
            'locale' => ['required', Rule::in(['en', 'ur'])],
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique(User::class)],
            'password' => ['required', 'string', Password::default()],
        ];
    }

    /**
     * @param  array<string, mixed>  $input  already validated with {@see self::rules()}
     */
    public static function fromValidated(array $input): self
    {
        return new self(
            clinicName: trim((string) $input['clinic']),
            country: strtoupper((string) $input['country']),
            timezone: (string) $input['timezone'],
            locale: (string) $input['locale'],
            adminName: trim((string) $input['name']),
            adminEmail: strtolower(trim((string) $input['email'])),
            adminPassword: (string) $input['password'],
        );
    }
}
