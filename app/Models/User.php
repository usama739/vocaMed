<?php

namespace App\Models;

use App\Enums\AccountNotification;
use App\Enums\Role;
use App\Support\TenantContext;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Attributes\Scope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Carbon;

/**
 * A staff member of one clinic, with one role. Patients are not users: they reach their own
 * appointment through a signed link.
 *
 * The clinic and the role are never mass-assignable, so a request can not choose them; the clinic
 * service and the invitation flow set them explicitly.
 *
 * @property int $id
 * @property string|null $clinic_id
 * @property string $name
 * @property string $email
 * @property Carbon|null $email_verified_at
 * @property string $password
 * @property Role|null $role
 * @property string $locale
 * @property bool $is_active
 * @property array<string, bool>|null $notification_preferences
 * @property string|null $remember_token
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Clinic|null $clinic
 */
#[Fillable(['name', 'email', 'password', 'locale'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'role' => Role::class,
            'is_active' => 'boolean',
            'notification_preferences' => 'array',
        ];
    }

    /**
     * The person as the pages see them (the shared `auth.user` prop and the Account page): nothing else of the model.
     *
     * @return array{id: string, name: string, email: string, role: string|null, locale: string}
     */
    public function asSessionUser(): array
    {
        return [
            'id' => (string) $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role?->value,
            'locale' => $this->locale,
        ];
    }

    /**
     * Which emails reach this person: what they chose, else the defaults.
     *
     * @return array<string, bool>
     */
    public function notificationChoices(): array
    {
        $chosen = $this->notification_preferences ?? [];
        $choices = [];

        foreach (AccountNotification::cases() as $key) {
            $choices[$key->value] = (bool) ($chosen[$key->value] ?? $key->default());
        }

        return $choices;
    }

    /**
     * @return BelongsTo<Clinic, $this>
     */
    public function clinic(): BelongsTo
    {
        return $this->belongsTo(Clinic::class);
    }

    /**
     * Whether this person may have a session right now. Checked at sign-in and again on every request, so
     * deactivating a person or suspending a clinic takes effect at once, not when the session runs out.
     */
    public function canSignIn(): bool
    {
        return $this->is_active
            && $this->role !== null
            && $this->email_verified_at !== null
            && $this->clinic?->isActive() === true;
    }

    /**
     * The staff of the clinic being acted for. `users` is the one clinic table read before a clinic is known (sign-in,
     * password reset), so it has no automatic scope; every staff list goes through this and fails with no clinic set.
     *
     * @param  Builder<User>  $query
     * @return Builder<User>
     */
    #[Scope]
    protected function inCurrentClinic(Builder $query): Builder
    {
        return $query->where($this->qualifyColumn('clinic_id'), app(TenantContext::class)->requireId());
    }

    public function hasRole(Role ...$roles): bool
    {
        return $this->role !== null && in_array($this->role, $roles, true);
    }
}
