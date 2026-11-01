<?php

namespace App\Live;

/** What changed, in the few words a screen needs to decide whether to read again. */
enum LiveTopic: string
{
    /** An appointment was booked, moved, cancelled or changed stage. */
    case Appointments = 'appointments';
    /** A reschedule request was made or decided. */
    case Requests = 'requests';
    /** A message to a patient was filed, sent, failed or resent, or a patient replied. */
    case Messages = 'messages';
    /** A slot hold was taken or let go. */
    case Slots = 'slots';
    /** Doctors, hours, services, patients, staff, settings or templates changed. */
    case Directory = 'directory';
    /** A line was added to the clinic's history. */
    case Audit = 'audit';
}
