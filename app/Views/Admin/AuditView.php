<?php

namespace App\Views\Admin;

use App\Models\AuditLog;
use App\Models\Clinic;
use App\Models\User;
use App\Support\AuditCategory;
use App\Support\ClinicClock;
use App\Views\ClinicView;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/** `AuditView`: the clinic's history, newest first, in pages of 25, filtered by days, person and group. */
final class AuditView
{
    public const PER_PAGE = 25;

    /**
     * @return array<string, mixed>
     */
    public function of(Clinic $clinic, int $days, ?string $userId, ?string $category, int $page): array
    {
        $clock = ClinicClock::for($clinic);
        $today = $clock->today();
        $since = $clock->startOfDay(CarbonImmutable::parse($today)->subDays($days - 1)->format('Y-m-d'));

        $query = AuditLog::query()->where('created_at', '>=', $since);

        if ($userId !== null && $userId !== '') {
            $query->where('actor_type', 'user')->where('actor_id', $userId);
        }

        if ($category !== null && in_array($category, AuditCategory::ALL, true)) {
            $query = AuditCategory::scope($query, $category);
        }

        $total = (clone $query)->count();
        $entries = $query->orderByDesc('created_at')->orderByDesc('id')->forPage($page, self::PER_PAGE)->get();
        $names = User::query()->inCurrentClinic()->pluck('name', 'id')->mapWithKeys(fn ($name, $id) => [(string) $id => $name]);

        return [
            'clinic' => ClinicView::of($clinic),
            'today' => $today,
            'total' => $total,
            'page' => $page,
            'perPage' => self::PER_PAGE,
            'rows' => $entries->map(fn (AuditLog $entry) => [
                'id' => $entry->id,
                'at' => $entry->created_at->utc()->format('Y-m-d\TH:i:s.v\Z'),
                'actor' => $this->actor($entry, $names),
                'category' => AuditCategory::of($entry->action),
                'action' => $entry->action,
                'meta' => (object) ($entry->meta ?? []),
            ])->all(),
            'users' => $this->people($names),
        ];
    }

    /**
     * @param  Collection<string, string>  $names
     * @return array{kind: string, name: string|null}
     */
    private function actor(AuditLog $entry, $names): array
    {
        if ($entry->actor_type === 'user' && $entry->actor_id !== null && isset($names[$entry->actor_id])) {
            return ['kind' => 'user', 'name' => $names[$entry->actor_id]];
        }

        return ['kind' => $entry->actor_type === 'patient' ? 'patient' : 'system', 'name' => null];
    }

    /**
     * The people who appear in the log, for the person chips.
     *
     * @param  Collection<string, string>  $names
     * @return list<array{id: string, name: string}>
     */
    private function people($names): array
    {
        $seen = AuditLog::query()->where('actor_type', 'user')->distinct()->pluck('actor_id')->filter()->all();

        $people = [];

        foreach ($seen as $id) {
            if (isset($names[$id])) {
                $people[] = ['id' => (string) $id, 'name' => (string) $names[$id]];
            }
        }

        usort($people, fn (array $x, array $y) => strcmp($x['name'], $y['name']));

        return $people;
    }
}
