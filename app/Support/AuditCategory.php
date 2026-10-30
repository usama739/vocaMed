<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Builder;

/**
 * The six groups the audit log's filter chips use (booking, edit, cancel, login, settings, invite). An action belongs to
 * one group by its name; anything not named here is an "edit".
 */
final class AuditCategory
{
    public const ALL = ['booking', 'edit', 'cancel', 'login', 'settings', 'invite'];

    /** Action name prefixes that are settings changes. */
    private const SETTINGS_PREFIXES = ['settings.', 'template.', 'service.', 'doctor.', 'availability.'];

    public static function of(string $action): string
    {
        return match (true) {
            $action === 'appointment.created' => 'booking',
            $action === 'appointment.cancelled' => 'cancel',
            str_starts_with($action, 'auth.') => 'login',
            str_starts_with($action, 'user.') => 'invite',
            self::isSettings($action) => 'settings',
            default => 'edit',
        };
    }

    /**
     * Narrow an audit query to one group.
     *
     * @template TModel of \Illuminate\Database\Eloquent\Model
     *
     * @param  Builder<TModel>  $query
     * @return Builder<TModel>
     */
    public static function scope(Builder $query, string $category): Builder
    {
        return match ($category) {
            'booking' => $query->where('action', 'appointment.created'),
            'cancel' => $query->where('action', 'appointment.cancelled'),
            'login' => $query->where('action', 'like', 'auth.%'),
            'invite' => $query->where('action', 'like', 'user.%'),
            'settings' => $query->where(fn (Builder $q) => self::applySettings($q)),
            default => $query->where('action', '!=', 'appointment.created')->where('action', '!=', 'appointment.cancelled')
                ->where('action', 'not like', 'auth.%')->where('action', 'not like', 'user.%')
                ->where(fn (Builder $q) => self::applyNotSettings($q)),
        };
    }

    private static function isSettings(string $action): bool
    {
        foreach (self::SETTINGS_PREFIXES as $prefix) {
            if (str_starts_with($action, $prefix)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  Builder<*>  $query
     */
    private static function applySettings(Builder $query): void
    {
        foreach (self::SETTINGS_PREFIXES as $prefix) {
            $query->orWhere('action', 'like', $prefix.'%');
        }
    }

    /**
     * @param  Builder<*>  $query
     */
    private static function applyNotSettings(Builder $query): void
    {
        foreach (self::SETTINGS_PREFIXES as $prefix) {
            $query->where('action', 'not like', $prefix.'%');
        }
    }
}
