import { Head, router } from '@inertiajs/react';
import { Loader2, TriangleAlert, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
    BarMeter,
    DaySwitch,
    TimeStepper,
} from '@/components/doctor/availability-parts';
import { fromMinutes, toMinutes } from '@/components/reception/calendar/model';
import { formatWeekdayShort, localDate } from '@/components/reception/format';
import {
    Card,
    CardTitle,
    PageBody,
    PageError,
    PageHeader,
    PageLoading,
    SampleNote,
} from '@/components/reception/page-parts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatClock } from '@/components/vocamed/booking/format';
import { ChoiceChip } from '@/components/vocamed/choice-chip';
import { FormField } from '@/components/vocamed/form-fields';
import { notify } from '@/components/vocamed/toast';
import { useData } from '@/hooks/use-data';
import { useView } from '@/hooks/use-view';
import { useT } from '@/i18n/scope';
import type {
    AvailabilityDraft,
    AvailabilityPreview,
    DayHours,
} from '@/lib/data';
import { cn } from '@/lib/utils';

const FIRST = 6 * 60;
const LAST = 20 * 60;
const STEP = 30;

const keyOf = (draft: AvailabilityDraft | null | undefined) =>
    JSON.stringify(draft ?? null);

export default function Availability() {
    const { t, locale } = useT();
    const source = useData();
    const query = useView('availability', undefined, { refreshMs: 0 });
    const view = query.data;

    const [draft, setDraft] = useState<AvailabilityDraft | null>(null);
    // The saved draft the form started from, so a reload can tell whether anything was edited.
    const draftBase = useRef<AvailabilityDraft | null>(null);
    const [preview, setPreview] = useState<AvailabilityPreview | null>(null);
    const [previewing, setPreviewing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [justSaved, setJustSaved] = useState<string | null>(null);
    const [blockedDay, setBlockedDay] = useState(1);
    const [off, setOff] = useState({ a: '', b: '', reason: '', error: '' });

    // The page edits its own copy. A reload only replaces it when nothing was edited.
    const savedKey = justSaved ?? keyOf(view?.draft);

    useEffect(() => {
        if (!view) {
            return;
        }

        const previous = draftBase.current;
        draftBase.current = view.draft;
        setDraft((current) =>
            current === null || keyOf(current) === keyOf(previous)
                ? view.draft
                : current,
        );
        setJustSaved(null);
    }, [view]);

    const dirty = draft !== null && keyOf(draft) !== savedKey;

    // Ask the server what the draft would produce (the slot rules live on the backend).
    useEffect(() => {
        if (!draft || !view) {
            return;
        }

        if (!dirty) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setPreview(view.preview);

            return;
        }

        let cancelled = false;
        const timer = window.setTimeout(async () => {
            setPreviewing(true);

            try {
                const next = await source.doctors.previewAvailability(draft);

                if (!cancelled) {
                    setPreview(next);
                }
            } catch {
                // Keep the last preview; saving will report a real problem.
            } finally {
                if (!cancelled) {
                    setPreviewing(false);
                }
            }
        }, 300);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [draft, dirty, view, source]);

    // Leaving with unsaved changes asks first.
    useEffect(() => {
        if (!dirty) {
            return;
        }

        const stop = router.on('before', (event) => {
            if (!window.confirm(t('doctor.availability.leave'))) {
                event.preventDefault();
            }
        });
        const warn = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener('beforeunload', warn);

        return () => {
            stop();
            window.removeEventListener('beforeunload', warn);
        };
    }, [dirty, t]);

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

    const save = async () => {
        if (!draft) {
            return;
        }

        setSaving(true);

        try {
            await source.doctors.saveAvailability(draft);
            setJustSaved(keyOf(draft));
            notify('success', t('doctor.availability.saved'));
            query.reload();
        } catch {
            notify('error', t('doctor.availability.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    const affected = preview?.affected ?? [];
    const tz = view?.clinic.timezone ?? 'UTC';
    const max = Math.max(10, ...(preview?.slotsPerWeekday ?? [0]));
    const dayList = useMemo(
        () => draft?.days.filter((d) => d.weekday !== 0) ?? [],
        [draft],
    );
    const chosen = draft?.days.find((d) => d.weekday === blockedDay);

    const affectedList = affected
        .map(
            (a) =>
                `${formatWeekdayShort(localDate(a.startsAt, tz), locale)} ${formatClock(a.startsAt, tz)}`,
        )
        .join(', ');

    return (
        <>
            <Head title={t('doctor.availability.title')} />
            <PageBody>
                <PageHeader
                    title={t('doctor.availability.title')}
                    lead={t('doctor.availability.sub')}
                    actions={
                        <>
                            {dirty && (
                                <span
                                    role="status"
                                    className="animate-fade text-label font-semibold text-warning-ink motion-reduce:animate-none"
                                >
                                    {t('doctor.availability.unsaved')}
                                </span>
                            )}
                            <Button disabled={!dirty || saving} onClick={save}>
                                {saving && (
                                    <Loader2
                                        aria-hidden="true"
                                        className="animate-spin motion-reduce:animate-none"
                                    />
                                )}
                                {affected.length > 0
                                    ? t('doctor.availability.saveAnyway')
                                    : t('doctor.availability.save')}
                            </Button>
                        </>
                    }
                />

                {query.status === 'loading' && (
                    <PageLoading
                        label={t('doctor.loading')}
                        blocks={[64, 480, 200]}
                    />
                )}
                {query.status === 'error' && (
                    <PageError onRetry={query.reload} />
                )}

                {query.status === 'ready' && view && draft && (
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
                                                    onChange={(on) =>
                                                        toggleDay(day, on)
                                                    }
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
                                                                start - STEP >=
                                                                FIRST
                                                            }
                                                            canLater={
                                                                start + STEP <=
                                                                end - STEP
                                                            }
                                                            onEarlier={() =>
                                                                patchDay(
                                                                    day.weekday,
                                                                    {
                                                                        start: fromMinutes(
                                                                            start -
                                                                                STEP,
                                                                        ),
                                                                    },
                                                                )
                                                            }
                                                            onLater={() =>
                                                                patchDay(
                                                                    day.weekday,
                                                                    {
                                                                        start: fromMinutes(
                                                                            start +
                                                                                STEP,
                                                                        ),
                                                                    },
                                                                )
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
                                                                end - STEP >=
                                                                start + STEP
                                                            }
                                                            canLater={
                                                                end + STEP <=
                                                                LAST
                                                            }
                                                            onEarlier={() =>
                                                                patchDay(
                                                                    day.weekday,
                                                                    {
                                                                        end: fromMinutes(
                                                                            end -
                                                                                STEP,
                                                                        ),
                                                                    },
                                                                )
                                                            }
                                                            onLater={() =>
                                                                patchDay(
                                                                    day.weekday,
                                                                    {
                                                                        end: fromMinutes(
                                                                            end +
                                                                                STEP,
                                                                        ),
                                                                    },
                                                                )
                                                            }
                                                        />
                                                        <ChoiceChip
                                                            pressed={day.lunch}
                                                            onClick={() =>
                                                                patchDay(
                                                                    day.weekday,
                                                                    {
                                                                        lunch: !day.lunch,
                                                                    },
                                                                )
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
                                                        {t(
                                                            'doctor.availability.closed',
                                                        )}
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
                                                                              (
                                                                                  _,
                                                                                  i,
                                                                              ) =>
                                                                                  i !==
                                                                                  index,
                                                                          ),
                                                                  }
                                                                : d,
                                                        )
                                                    }
                                                >
                                                    <X aria-hidden="true" />
                                                    {t(
                                                        'doctor.availability.remove',
                                                    )}
                                                </Button>
                                            </div>
                                        );
                                    })}
                                    <form
                                        onSubmit={addOff}
                                        noValidate
                                        className="flex flex-wrap items-end gap-3"
                                    >
                                        <FormField
                                            label={t(
                                                'doctor.availability.offFrom',
                                            )}
                                        >
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
                                        <FormField
                                            label={t(
                                                'doctor.availability.offTo',
                                            )}
                                        >
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
                                            label={t(
                                                'doctor.availability.reason',
                                            )}
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
                                                            reason: e.target
                                                                .value,
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
                                            {t(
                                                'doctor.availability.blockedSub',
                                            )}
                                        </span>
                                    </div>
                                    <div
                                        role="group"
                                        aria-label={t(
                                            'doctor.availability.pickDay',
                                        )}
                                        className="flex flex-wrap gap-2"
                                    >
                                        {dayList.map((day) => (
                                            <ChoiceChip
                                                key={day.weekday}
                                                pressed={
                                                    blockedDay === day.weekday
                                                }
                                                onClick={() =>
                                                    setBlockedDay(day.weekday)
                                                }
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
                                                            toMinutes(
                                                                chosen.start,
                                                            )) /
                                                            STEP,
                                                    ),
                                                },
                                                (_, i) =>
                                                    fromMinutes(
                                                        toMinutes(
                                                            chosen.start,
                                                        ) +
                                                            i * STEP,
                                                    ),
                                            ).map((time) => {
                                                const blocked =
                                                    draft.blocked.some(
                                                        (b) =>
                                                            b.weekday ===
                                                                blockedDay &&
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
                                                            toggleBlocked(
                                                                blockedDay,
                                                                time,
                                                            )
                                                        }
                                                        className={cn(
                                                            blocked &&
                                                                'border-danger bg-danger-surface text-danger-deep',
                                                        )}
                                                    >
                                                        <span dir="ltr">
                                                            {blocked
                                                                ? '✕ '
                                                                : ''}
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
                                            count={
                                                preview?.slotsPerWeekday[
                                                    index
                                                ] ?? 0
                                            }
                                            max={max}
                                            countLabel={t(
                                                'doctor.availability.slots',
                                                {
                                                    count:
                                                        preview
                                                            ?.slotsPerWeekday[
                                                            index
                                                        ] ?? 0,
                                                },
                                            )}
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
                )}

                <SampleNote />
            </PageBody>
        </>
    );
}
