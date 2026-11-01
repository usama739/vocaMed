<?php

namespace App\Live;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;

/**
 * "Something changed in this clinic": a nudge for open screens to read their data again, never the data itself. It names
 * a topic (see `LiveTopic`) and the record's id, and nothing a stranger could use: the screen asks the normal, checked
 * routes for what it shows. Raised through `LiveUpdates::announce()`, which waits for the change to be saved and cannot
 * break it. Queued (a slow socket server never slows the change), to the clinic's channel and, when the change belongs
 * to one doctor, that doctor's own channel.
 */
final class LiveUpdate implements ShouldBroadcast
{
    /** A change is not worth retrying for long: the screens' slow refresh catches up anyway. */
    public int $tries = 2;

    public function __construct(
        public readonly string $clinicId,
        public readonly string $topic,
        public readonly ?string $doctorId = null,
        public readonly ?string $id = null,
    ) {}

    /** @return array<int, PrivateChannel> */
    public function broadcastOn(): array
    {
        $channels = [new PrivateChannel("clinic.{$this->clinicId}")];

        if ($this->doctorId !== null) {
            $channels[] = new PrivateChannel("clinic.{$this->clinicId}.doctor.{$this->doctorId}");
        }

        return $channels;
    }

    public function broadcastAs(): string
    {
        return 'live';
    }

    /** @return array{topic: string, id: string|null} */
    public function broadcastWith(): array
    {
        return ['topic' => $this->topic, 'id' => $this->id];
    }
}
