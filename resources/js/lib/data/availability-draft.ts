import type { AvailabilityDraft, DoctorAvailability } from './types';

/** Monday-first weekdays, as the availability editor lists them. */
export const WEEK = [1, 2, 3, 4, 5, 6, 0];

/** The editor's form of a doctor's stored availability. */
export const draftOf = (stored: DoctorAvailability): AvailabilityDraft => ({
    days: WEEK.map((weekday) => {
        const window = stored.windows.find((w) => w.weekday === weekday);

        return window
            ? {
                  weekday,
                  on: true,
                  start: window.start,
                  end: window.end,
                  lunch: window.breaks.length > 0,
              }
            : {
                  weekday,
                  on: false,
                  start: '09:00',
                  end: '13:00',
                  lunch: false,
              };
    }),
    timeOff: stored.timeOff.map((t) => ({
        id: t.id,
        startDate: t.startDate,
        endDate: t.endDate,
        reason: t.reason,
    })),
    blocked: stored.blocked ?? [],
});

/** A doctor who does not exist yet starts on weekdays, nine to five. */
export const blankDraft = (): AvailabilityDraft => ({
    days: WEEK.map((weekday) =>
        weekday >= 1 && weekday <= 5
            ? {
                  weekday,
                  on: true,
                  start: '09:00',
                  end: '17:00',
                  lunch: false,
              }
            : {
                  weekday,
                  on: false,
                  start: '09:00',
                  end: '13:00',
                  lunch: false,
              },
    ),
    timeOff: [],
    blocked: [],
});
