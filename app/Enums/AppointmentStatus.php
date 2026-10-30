<?php

namespace App\Enums;

/**
 * Where an appointment is in its life. The moves allowed are the ones the reception screens offer (`lib/data/status.ts`):
 * generous going forward, because a patient who walks straight in is "in consultation", and finished appointments stay
 * finished.
 */
enum AppointmentStatus: string
{
    case Booked = 'booked';
    case Confirmed = 'confirmed';
    case Arrived = 'arrived';
    case InConsultation = 'in_consultation';
    case Done = 'done';
    case Cancelled = 'cancelled';
    case NoShow = 'no_show';

    /**
     * Where this status may go next.
     *
     * @return list<self>
     */
    public function transitions(): array
    {
        return match ($this) {
            self::Booked => [self::Confirmed, self::Arrived, self::InConsultation, self::Done, self::Cancelled, self::NoShow],
            self::Confirmed => [self::Arrived, self::InConsultation, self::Done, self::Cancelled, self::NoShow],
            self::Arrived => [self::InConsultation, self::Done, self::Cancelled, self::NoShow],
            self::InConsultation => [self::Arrived, self::Done, self::NoShow],
            self::Done, self::Cancelled, self::NoShow => [],
        };
    }

    public function canMoveTo(self $to): bool
    {
        return in_array($to, $this->transitions(), true);
    }

    /** What "press again to undo" returns to; null when there is nothing to undo. */
    public function previous(): ?self
    {
        return match ($this) {
            self::Arrived, self::NoShow => self::Confirmed,
            self::InConsultation => self::Arrived,
            self::Done => self::InConsultation,
            default => null,
        };
    }

    /** Booked or confirmed: still to come, so it can be rescheduled or cancelled by reception. */
    public function isOpen(): bool
    {
        return $this === self::Booked || $this === self::Confirmed;
    }

    /** Whether the appointment still takes up the doctor's time (and so owns its cells). */
    public function holdsTime(): bool
    {
        return in_array($this, [self::Booked, self::Confirmed, self::Arrived, self::InConsultation], true);
    }
}
