import { TriangleAlert, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
    BarMeter,
    DaySwitch,
    TimeStepper,
} from '@/components/doctor/availability-parts';
import { fromMinutes, toMinutes } from '@/components/reception/calendar/model';
import { formatWeekdayShort, localDate } from '@/components/reception/format';
import { Card, CardTitle } from '@/components/reception/page-parts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatClock } from '@/components/vocamed/booking/format';
import { ChoiceChip } from '@/components/vocamed/choice-chip';
import { FormField } from '@/components/vocamed/form-fields';
import { useT } from '@/i18n/scope';
import type { DayHours } from '@/lib/data';
import { cn } from '@/lib/utils';
import type { AvailabilityEditorState } from './use-availability-editor';

const FIRST = 6 * 60;
const LAST = 20 * 60;
const STEP = 30;

/**
 * Weekly hours, time off, blocked times and the live preview: the whole availability editor,
 * used on the doctor's Availability page and on the admin's Doctor profile. The page owns the
 * save button, because on the profile it saves more than the hours.
 */
export function AvailabilityEditor({
    editor,
    timezone,
}: {
    editor: AvailabilityEditorState;
    timezone: string;
}) {
    const { t, locale } = useT();
    const { draft, setDraft, preview, previewing, affected } = editor;
    const [blockedDay, setBlockedDay] = useState(1);
    const [off, setOff] = useState({ a: '', b: '', reason: '', error: '' });

    if (!draft) {
        return null;
    }

    const patchDay = (weekday: number, patch: Partial<DayHours>) =>
        setDraft((d) =>
            d
                ? {
                      ...d,
                      days: d.days.map((day) =>
                          day.weekday === weekday ? { ...day, ...patch } : day,
                      ),
                  }
                : d,
        );

    const toggleDay = (day: DayHours, on: boolean) =>
        patchDay(day.weekday, {
            on,
            // A day switched on gets the usual lunch break when it is a long one.
            lunch: on ? toMinutes(day.end) - toMinutes(day.start) > 300 : false,
        });

    const toggleBlocked = (weekday: number, time: string) =>
        setDraft((d) => {
            if (!d) {
                return d;
            }

            const exists = d.blocked.some(
                (b) => b.weekday === weekday && b.time === time,
            );

            return {
                ...d,
                blocked: exists
                    ? d.blocked.filter(
                          (b) => !(b.weekday === weekday && b.time === time),
                      )
                    : [...d.blocked, { weekday, time }],
            };
        });

    const addOff = (event: FormEvent) => {
        event.preventDefault();

        if (!off.a || !off.b || off.b < off.a) {
            setOff((o) => ({ ...o, error: t('doctor.availability.errDates') }));

            return;
        }

        setDraft((d) =>
            d
                ? {
                      ...d,
                      timeOff: [
                          ...d.timeOff,
                          {
                              id: null,
                              startDate: off.a,
                              endDate: off.b,
                              reason: off.reason.trim(),
                          },
                      ],
                  }
                : d,
        );
        setOff({ a: '', b: '', reason: '', error: '' });
    };

    const max = Math.max(10, ...(preview?.slotsPerWeekday ?? [0]));
    const dayList = draft.days.filter((d) => d.weekday !== 0);
    const chosen = draft.days.find((d) => d.weekday === blockedDay);

    const affectedList = affected
        .map(
            (a) =>
                `${formatWeekdayShort(localDate(a.startsAt, timezone), locale)} ${formatClock(a.startsAt, timezone)}`,
        )
        .join(', ');

    return (
        <>
            {affected.length > 0 && (
                <div
                    role="alert"
                    className="flex animate-rise items-start gap-3 rounded-lg border border-[#e3b341] bg-[#fff8e8] px-[18px] py-3.5 text-control text-[#5c3900] motion-reduce:animate-none"
                >
                    <TriangleAlert
                        aria-hidden="true"
                        className="mt-1 size-5 shrink-0"
                    />
                    <div className="flex flex-col gap-1">
                        <strong>
                            {t('doctor.availability.affectedTitle')}
                        </strong>
                        <span className="text-label">
                            {t('doctor.availability.affectedList', {
                                list: affectedList,
                            })}
                        </span>
                        <span className="text-label">
                            {t('doctor.availability.affectedNote')}
                        </span>
                    </div>
                </div>
            )}

            <div className="flex flex-wrap items-start gap-5">
                <div className="flex min-w-0 flex-[2_1_520px] flex-col gap-5">
                    <section
                        aria-labelledby="weekly-hours"
                        className="animate-rise overflow-hidden rounded-xl border border-line bg-white motion-reduce:animate-none"
                    >
                        <h2
                            id="weekly-hours"
                            className="border-b border-line bg-surface-subtle px-5 py-4 text-lead font-semibold text-ink"
                        >
                            {t('doctor.availability.weekly')}
                        </h2>
                        {draft.days.map((day) => {
                            const name = t(
                                `doctor.availability.day.${day.weekday}`,
                            );
                            const start = toMinutes(day.start);
                            const end = toMinutes(day.end);

                            return (
                                <div
                                    key={day.weekday}
                                    data-weekday={day.weekday}
                                    className="flex min-h-[76px] flex-wrap items-center gap-x-5 gap-y-3.5 border-b border-line-soft px-5 py-3.5 last:border-b-0"
                                >
                                    <DaySwitch
                                        checked={day.on}
                                        label={name}
                                        onChange={(on) => toggleDay(day, on)}
                                    />
                                    <span className="w-[110px] text-body font-bold text-ink">
                                        {name}
                                    </span>
                                    {day.on ? (
                                        <div className="flex flex-wrap items-center gap-x-[18px] gap-y-2.5">
                                            <TimeStepper
                                                label={t(
                                                    'doctor.availability.from',
                                                )}
                                                value={day.start}
                                                earlierLabel={t(
                                                    'doctor.availability.earlier',
                                                )}
                                                laterLabel={t(
                                                    'doctor.availability.later',
                                                )}
                                                canEarlier={
                                                    start - STEP >= FIRST
                                                }
                                                canLater={
                                                    start + STEP <= end - STEP
                                                }
                                                onEarlier={() =>
                                                    patchDay(day.weekday, {
                                                        start: fromMinutes(
                                                            start - STEP,
                                                        ),
                                                    })
                                                }
                                                onLater={() =>
                                                    patchDay(day.weekday, {
                                                        start: fromMinutes(
                                                            start + STEP,
                                                        ),
                                                    })
                                                }
                                            />
                                            <TimeStepper
                                                label={t(
                                                    'doctor.availability.to',
                                                )}
                                                value={day.end}
                                                earlierLabel={t(
                                                    'doctor.availability.earlier',
                                                )}
                                                laterLabel={t(
                                                    'doctor.availability.later',
                                                )}
                                                canEarlier={
                                                    end - STEP >= start + STEP
                                                }
                                                canLater={end + STEP <= LAST}
                                                onEarlier={() =>
                                                    patchDay(day.weekday, {
                                                        end: fromMinutes(
                                                            end - STEP,
                                                        ),
                                                    })
                                                }
                                                onLater={() =>
                                                    patchDay(day.weekday, {
                                                        end: fromMinutes(
                                                            end + STEP,
                                                        ),
                                                    })
                                                }
                                            />
                                            <ChoiceChip
                                                pressed={day.lunch}
                                                onClick={() =>
                                                    patchDay(day.weekday, {
                                                        lunch: !day.lunch,
                                                    })
                                                }
                                            >
                                                {day.lunch
                                                    ? t(
                                                          'doctor.availability.lunch',
                                                      )
                                                    : t(
                                                          'doctor.availability.noLunch',
                                                      )}
                                            </ChoiceChip>
                                        </div>
                                    ) : (
                                        <span className="text-control text-subtle">
                                            {t('doctor.availability.closed')}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </section>

                    <Card
                        aria-labelledby="time-off"
                        className="flex animate-rise flex-col gap-3.5 p-5 [animation-delay:60ms] motion-reduce:animate-none"
                    >
                        <CardTitle id="time-off">
                            {t('doctor.availability.timeOff')}
                        </CardTitle>
                        {draft.timeOff.length === 0 && (
                            <p className="text-control">
                                {t('doctor.availability.noTimeOff')}
                            </p>
                        )}
                        {draft.timeOff.map((item, index) => {
                            const range = `${item.startDate} → ${item.endDate}`;

                            return (
                                <div
                                    key={`${item.id ?? 'new'}-${index}`}
                                    className="flex animate-fade flex-wrap items-center justify-between gap-2.5 rounded-lg border border-line px-3.5 py-2.5 motion-reduce:animate-none"
                                >
                                    <div className="flex flex-col leading-[1.4]">
                                        <span
                                            dir="ltr"
                                            className="text-start text-control font-semibold text-ink"
                                        >
                                            {range}
                                        </span>
                                        <span className="text-label">
                                            {item.reason}
                                        </span>
                                    </div>
                                    <Button
                                        variant="outline-destructive"
                                        size="sm"
                                        aria-label={t(
                                            'doctor.availability.removeAria',
                                            { range },
                                        )}
                                        onClick={() =>
                                            setDraft((d) =>
                                                d
                                                    ? {
                                                          ...d,
                                                          timeOff:
                                                              d.timeOff.filter(
                                                                  (_, i) =>
                                                                      i !==
                                                                      index,
                                                              ),
                                                      }
                                                    : d,
                                            )
                                        }
                                    >
                                        <X aria-hidden="true" />
                                        {t('doctor.availability.remove')}
                                    </Button>
                                </div>
                            );
                        })}
                        <form
                            onSubmit={addOff}
                            noValidate
                            className="flex flex-wrap items-end gap-3"
                        >
                            <FormField label={t('doctor.availability.offFrom')}>
                                {(control) => (
                                    <Input
                                        {...control}
                                        type="date"
                                        dir="ltr"
                                        value={off.a}
                                        onChange={(e) =>
                                            setOff({
                                                ...off,
                                                a: e.target.value,
                                                error: '',
                                            })
                                        }
                                        className="min-w-[170px]"
                                    />
                                )}
                            </FormField>
                            <FormField label={t('doctor.availability.offTo')}>
                                {(control) => (
                                    <Input
                                        {...control}
                                        type="date"
                                        dir="ltr"
                                        value={off.b}
                                        onChange={(e) =>
                                            setOff({
                                                ...off,
                                                b: e.target.value,
                                                error: '',
                                            })
                                        }
                                        className="min-w-[170px]"
                                    />
                                )}
                            </FormField>
                            <FormField
                                label={t('doctor.availability.reason')}
                                className="min-w-[180px] flex-[1_1_180px]"
                            >
                                {(control) => (
                                    <Input
                                        {...control}
                                        value={off.reason}
                                        placeholder={t(
                                            'doctor.availability.reasonPh',
                                        )}
                                        onChange={(e) =>
                                            setOff({
                                                ...off,
                                                reason: e.target.value,
                                            })
                                        }
                                    />
                                )}
                            </FormField>
                            <Button
                                type="submit"
                                variant="outline"
                                className="border-brand text-brand-deep"
                            >
                                {t('doctor.availability.addOff')}
                            </Button>
                        </form>
                        {off.error && (
                            <p
                                role="alert"
                                className="rounded-lg border border-danger-line bg-danger-surface px-3.5 py-2.5 text-control text-danger-deep"
                            >
                                {off.error}
                            </p>
                        )}
                    </Card>

                    <Card
                        aria-labelledby="blocked-slots"
                        className="flex animate-rise flex-col gap-3.5 p-5 [animation-delay:120ms] motion-reduce:animate-none"
                    >
                        <div className="flex flex-col gap-0.5">
                            <CardTitle id="blocked-slots">
                                {t('doctor.availability.blocked')}
                            </CardTitle>
                            <span className="text-label">
                                {t('doctor.availability.blockedSub')}
                            </span>
                        </div>
                        <div
                            role="group"
                            aria-label={t('doctor.availability.pickDay')}
                            className="flex flex-wrap gap-2"
                        >
                            {dayList.map((day) => (
                                <ChoiceChip
                                    key={day.weekday}
                                    pressed={blockedDay === day.weekday}
                                    onClick={() => setBlockedDay(day.weekday)}
                                >
                                    {t(
                                        `doctor.availability.dayShort.${day.weekday}`,
                                    )}
                                </ChoiceChip>
                            ))}
                        </div>
                        {chosen?.on ? (
                            <div className="flex flex-wrap gap-2">
                                {Array.from(
                                    {
                                        length: Math.max(
                                            0,
                                            (toMinutes(chosen.end) -
                                                toMinutes(chosen.start)) /
                                                STEP,
                                        ),
                                    },
                                    (_, i) =>
                                        fromMinutes(
                                            toMinutes(chosen.start) + i * STEP,
                                        ),
                                ).map((time) => {
                                    const blocked = draft.blocked.some(
                                        (b) =>
                                            b.weekday === blockedDay &&
                                            b.time === time,
                                    );

                                    return (
                                        <ChoiceChip
                                            key={time}
                                            pressed={blocked}
                                            aria-label={
                                                blocked
                                                    ? `${time}, ${t('doctor.availability.blockedOn')}`
                                                    : time
                                            }
                                            onClick={() =>
                                                toggleBlocked(blockedDay, time)
                                            }
                                            className={cn(
                                                blocked &&
                                                    'border-danger bg-danger-surface text-danger-deep',
                                            )}
                                        >
                                            <span dir="ltr">
                                                {blocked ? '✕ ' : ''}
                                                {time}
                                            </span>
                                        </ChoiceChip>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="text-control text-subtle">
                                {t('doctor.availability.closed')}
                            </p>
                        )}
                    </Card>
                </div>

                <aside
                    aria-labelledby="preview-title"
                    className="sticky top-3 flex min-w-0 flex-[1_1_280px] animate-rise flex-col gap-3.5 rounded-xl border border-line bg-white p-5 [animation-delay:180ms] motion-reduce:animate-none"
                >
                    <div className="flex flex-col gap-0.5">
                        <CardTitle id="preview-title">
                            {t('doctor.availability.preview')}
                        </CardTitle>
                        <span className="text-label">
                            {t('doctor.availability.previewSub')}
                        </span>
                    </div>
                    <div
                        className={cn(
                            'flex flex-col gap-2 transition-opacity duration-200',
                            previewing && 'opacity-60',
                        )}
                        aria-busy={previewing}
                    >
                        {draft.days.map((day, index) => (
                            <BarMeter
                                key={day.weekday}
                                name={t(
                                    `doctor.availability.dayShort.${day.weekday}`,
                                )}
                                count={preview?.slotsPerWeekday[index] ?? 0}
                                max={max}
                                countLabel={t('doctor.availability.slots', {
                                    count: preview?.slotsPerWeekday[index] ?? 0,
                                })}
                            />
                        ))}
                    </div>
                    <div
                        role="status"
                        className="flex flex-col border-t border-line-soft pt-3"
                    >
                        <span className="text-[28px] leading-[1.3] font-bold text-ink">
                            {preview?.total ?? 0}
                        </span>
                        <span className="text-label">
                            {t('doctor.availability.totalLabel')}
                        </span>
                    </div>
                </aside>
            </div>
        </>
    );
}
