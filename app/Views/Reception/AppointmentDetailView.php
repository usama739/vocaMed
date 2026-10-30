<?php

namespace App\Views\Reception;

use App\Models\Appointment;
use App\Models\AuditLog;
use App\Models\Clinic;
use App\Models\User;
use App\Support\ClinicClock;
use App\Views\ClinicView;
use Illuminate\Database\Eloquent\Collection;

/**
 * `AppointmentDetailView` (B3): one appointment's row, what the clinic's own history says happened to it (oldest first, with who
 * did it) and the messages sent for it. Messages arrive with the messaging step, so the timeline is empty until then.
 */
final class AppointmentDetailView
{
    public function __construct(private readonly AppointmentRows $rows) {}

    /**
     * @return array<string, mixed>
     */
    public function of(Clinic $clinic, User $viewer, Appointment $appointment): array
    {
        /** @var Collection<int, Appointment> $one */
        $one = new Collection([$appointment]);

        $entries = AuditLog::query()
            ->where('subject_type', 'Appointment')->where('subject_id', $appointment->id)
            ->orderBy('created_at')->orderBy('id')->get();
        $names = AppointmentRows::names(array_values(array_unique(array_filter(
            $entries->where('actor_type', 'user')->pluck('actor_id')->map(fn ($id) => $id === null ? null : (string) $id)->all(),
        ))));

        return [
            'clinic' => ClinicView::of($clinic),
            'today' => ClinicClock::for($clinic)->today(),
            'row' => $this->rows->of($clinic, $viewer, $one)[0],
            'timeline' => [],
            'history' => $entries->map(fn (AuditLog $entry) => [
                'id' => $entry->id,
                'action' => $entry->action,
                'meta' => (object) ($entry->meta ?? []),
                'at' => $entry->created_at->utc()->format('Y-m-d\TH:i:s.v\Z'),
                'actor' => $entry->actor_type === 'patient'
                    ? ['kind' => 'patient', 'name' => null]
                    : AppointmentRows::actor($entry->actor_type === 'user' ? $entry->actor_id : null, $names),
            ])->all(),
        ];
    }
}
