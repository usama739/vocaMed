import { Head } from '@inertiajs/react';
import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ClockStepper } from '@/components/admin/settings/clock-stepper';
import {
    OPEN_FROM,
    OPEN_TO,
    REMINDER_CHOICES,
    CANCEL_CHOICES,
    RETENTION_CHOICES,
    STEP,
    draftOf,
    formOf,
    fromMinutes,
    keyOf,
    orderHolidays,
    sortReminders,
    toMinutes,
    type SettingsForm,
} from '@/components/admin/settings/form';
import { NativeSelect } from '@/components/admin/settings/native-select';
import { SaveBar } from '@/components/admin/save-bar';
import {
    Card,
    CardTitle,
    PageBody,
    PageError,
    PageHeader,
    PageLoading,
} from '@/components/reception/page-parts';
import { todayIn } from '@/components/reception/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/vocamed/confirm-dialog';
import { FormField, TextField } from '@/components/vocamed/form-fields';
import { notify } from '@/components/vocamed/toast';
import { ToggleSwitch } from '@/components/vocamed/toggle-switch';
import { useData } from '@/hooks/use-data';
import { useErrorText } from '@/hooks/use-error-text';
import { useLeaveGuard } from '@/hooks/use-leave-guard';
import { useView } from '@/hooks/use-view';
import { useT } from '@/i18n/scope';
import { DataError, type Locale } from '@/lib/data';
import { TIMEZONES, timezoneLabel } from '@/lib/geo';

const INNER = 'flex flex-col gap-1';

export default function Settings() {
    const { t } = useT();
    const source = useData();
    const errors = useErrorText();
    // The page edits its own copy, so the data is not polled underneath the form.
    const query = useView('adminSettings', undefined, { refreshMs: 0 });
    const view = query.data;

    const [form, setForm] = useState<SettingsForm | null>(null);
    // The saved form the page started from, so a reload can tell whether anything was edited.
    const [base, setBase] = useState<SettingsForm | null>(null);
    const [saving, setSaving] = useState(false);
    const [confirmZone, setConfirmZone] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const baseRef = useRef<SettingsForm | null>(null);

    useEffect(() => {
        if (!view) {
            return;
        }

        const next = formOf(view);
        const previous = baseRef.current;
        baseRef.current = next;
        setBase(next);
        setForm((current) =>
            current === null || keyOf(current) === keyOf(previous)
                ? next
                : current,
        );
    }, [view]);

    const dirty = form !== null && keyOf(form) !== keyOf(base);

    useLeaveGuard(dirty, t('admin.common.leave'));

    const patch = (changes: Partial<SettingsForm>) =>
        setForm((f) => (f ? { ...f, ...changes } : f));

    const persist = async () => {
        if (!form) {
            return;
        }

        setSaving(true);
        setFieldErrors({});

        try {
            await source.settings.save(draftOf(form));
            // What was typed is now what is saved; the reload brings the server's own wording.
            baseRef.current = form;
            setBase(form);
            notify('success', t('admin.settings.saved'));
            query.reload();
        } catch (caught) {
            const { field } = errors.forField(caught);

            if (
                caught instanceof DataError &&
                caught.code === 'VALIDATION' &&
                field === 'name'
            ) {
                setFieldErrors({ name: t('admin.settings.errName') });
            } else if (field === 'phone' || field === 'name') {
                setFieldErrors({ [field]: errors.message(caught) });
            } else {
                notify('error', errors.message(caught));
            }
        } finally {
            setSaving(false);
        }
    };

    const save = () => {
        if (form && base && form.timezone !== base.timezone) {
            setConfirmZone(true);

            return;
        }

        void persist();
    };

    const tz = view?.clinic.timezone ?? 'UTC';
    const today = todayIn(tz);

    return (
        <>
            <Head title={t('admin.settings.title')} />
            <PageBody className="max-w-[960px]">
                <PageHeader
                    title={t('admin.settings.title')}
                    lead={t('admin.settings.sub')}
                />

                {query.status === 'loading' && (
                    <PageLoading
                        label={t('admin.settings.loading')}
                        blocks={[260, 480, 320, 200]}
                    />
                )}
                {query.status === 'error' && (
                    <PageError onRetry={query.reload} />
                )}

                {query.status === 'ready' && view && form && (
                    <>
                        <DetailsCard
                            form={form}
                            patch={patch}
                            errors={fieldErrors}
                            clearError={(key) =>
                                setFieldErrors(({ [key]: _gone, ...rest }) => {
                                    void _gone;

                                    return rest;
                                })
                            }
                        />
                        <HoursCard form={form} patch={patch} today={today} />
                        <RemindersCard form={form} patch={patch} />
                        <VoiceCard form={form} patch={patch} />
                        <SaveBar
                            dirty={dirty}
                            saving={saving}
                            onSave={save}
                            onDiscard={() => {
                                setForm(base);
                                setFieldErrors({});
                            }}
                            saveLabel={t('admin.settings.save')}
                            savedLabel={t('admin.settings.saved')}
                        />
                    </>
                )}
            </PageBody>

            <ConfirmDialog
                open={confirmZone}
                onOpenChange={setConfirmZone}
                tone="default"
                title={t('admin.settings.tzTitle')}
                description={t('admin.settings.tzText')}
                confirmLabel={t('admin.settings.tzConfirm')}
                cancelLabel={t('admin.common.cancel')}
                onConfirm={persist}
            />
        </>
    );
}

type SectionProps = {
    form: SettingsForm;
    patch: (changes: Partial<SettingsForm>) => void;
};

const SECTION =
    'flex animate-rise flex-col gap-5 p-6 motion-reduce:animate-none';

function DetailsCard({
    form,
    patch,
    errors,
    clearError,
}: SectionProps & {
    errors: Record<string, string>;
    clearError: (key: string) => void;
}) {
    const { t } = useT();
    const zones: { id: string; label: string }[] = TIMEZONES.map((zone) => ({
        id: zone.id,
        label: timezoneLabel(zone),
    }));

    // A clinic on a zone outside the short list still shows it.
    if (!zones.some((zone) => zone.id === form.timezone)) {
        zones.push({ id: form.timezone, label: form.timezone });
    }

    return (
        <Card aria-labelledby="clinic-details" className={SECTION}>
            <CardTitle id="clinic-details">
                {t('admin.settings.details')}
            </CardTitle>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-[18px]">
                <TextField
                    label={t('admin.settings.clinicName')}
                    value={form.name}
                    error={errors.name}
                    onChange={(event) => {
                        patch({ name: event.target.value });
                        clearError('name');
                    }}
                />
                <TextField
                    label={t('admin.settings.phone')}
                    type="tel"
                    dir="ltr"
                    hint={t('admin.settings.phoneHint')}
                    value={form.phone}
                    error={errors.phone}
                    onChange={(event) => {
                        patch({ phone: event.target.value });
                        clearError('phone');
                    }}
                />
            </div>
            <TextField
                label={t('admin.settings.address')}
                hint={t('admin.settings.addressHint')}
                value={form.address}
                onChange={(event) => patch({ address: event.target.value })}
            />
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-[18px]">
                <NativeSelect
                    label={t('admin.settings.timezone')}
                    dir="ltr"
                    value={form.timezone}
                    onChange={(event) =>
                        patch({ timezone: event.target.value })
                    }
                    options={zones.map((zone) => ({
                        value: zone.id,
                        label: zone.label,
                    }))}
                />
                <fieldset className="flex flex-col gap-0.5 border-0 p-0">
                    <legend className="mb-1.5 p-0 text-label font-semibold text-ink">
                        {t('admin.settings.defLang')}
                    </legend>
                    <div className="flex flex-wrap gap-x-6 gap-y-1.5">
                        {(
                            [
                                ['en', 'English'],
                                ['ur', 'اردو'],
                            ] as [Locale, string][]
                        ).map(([value, label]) => (
                            <label
                                key={value}
                                className="flex min-h-12 cursor-pointer items-center gap-3 text-control text-ink"
                            >
                                <input
                                    type="radio"
                                    name="default-language"
                                    checked={form.defaultLocale === value}
                                    onChange={() =>
                                        patch({ defaultLocale: value })
                                    }
                                    className="m-0 size-[22px] accent-brand"
                                />
                                {label}
                            </label>
                        ))}
                    </div>
                </fieldset>
            </div>
        </Card>
    );
}

function HoursCard({ form, patch, today }: SectionProps & { today: string }) {
    const { t } = useT();
    const [holiday, setHoliday] = useState({ date: '', name: '', error: '' });

    const patchDay = (
        weekday: number,
        changes: Partial<SettingsForm['hours'][number]>,
    ) =>
        patch({
            hours: form.hours.map((day) =>
                day.weekday === weekday ? { ...day, ...changes } : day,
            ),
        });

    const addHoliday = (event: FormEvent) => {
        event.preventDefault();
        const name = holiday.name.trim();

        if (!holiday.date || !name) {
            setHoliday((h) => ({
                ...h,
                error: t('admin.settings.errHoliday'),
            }));

            return;
        }

        if (form.holidays.some((h) => h.date === holiday.date)) {
            setHoliday((h) => ({
                ...h,
                error: t('admin.settings.errHolidayTwice'),
            }));

            return;
        }

        patch({ holidays: [...form.holidays, { date: holiday.date, name }] });
        setHoliday({ date: '', name: '', error: '' });
    };

    const holidays = orderHolidays(form.holidays, today);

    return (
        <Card aria-labelledby="business-hours" className={SECTION}>
            <div className={INNER}>
                <CardTitle id="business-hours">
                    {t('admin.settings.hours')}
                </CardTitle>
                <p className="text-[14.5px]">{t('admin.settings.hoursSub')}</p>
            </div>
            <div className="flex flex-col">
                {form.hours.map((day) => {
                    const name = t(`admin.settings.day.${day.weekday}`);
                    const open = toMinutes(day.open);
                    const close = toMinutes(day.close);

                    return (
                        <div
                            key={day.weekday}
                            role="group"
                            aria-label={name}
                            data-weekday={day.weekday}
                            className="flex min-h-[60px] flex-wrap items-center gap-x-3.5 gap-y-2 border-b border-line-soft py-2"
                        >
                            <ToggleSwitch
                                checked={day.on}
                                label={name}
                                onChange={(on) => patchDay(day.weekday, { on })}
                            />
                            <span className="w-[92px] text-control font-semibold text-ink">
                                {name}
                            </span>
                            {day.on ? (
                                <>
                                    <ClockStepper
                                        label={t('admin.settings.opens')}
                                        value={day.open}
                                        earlierLabel={t('admin.common.earlier')}
                                        laterLabel={t('admin.common.later')}
                                        canEarlier={open - STEP >= OPEN_FROM}
                                        canLater={open + STEP <= close - STEP}
                                        onEarlier={() =>
                                            patchDay(day.weekday, {
                                                open: fromMinutes(open - STEP),
                                            })
                                        }
                                        onLater={() =>
                                            patchDay(day.weekday, {
                                                open: fromMinutes(open + STEP),
                                            })
                                        }
                                    />
                                    <span
                                        aria-hidden="true"
                                        className="text-subtle"
                                    >
                                        –
                                    </span>
                                    <ClockStepper
                                        label={t('admin.settings.closes')}
                                        value={day.close}
                                        earlierLabel={t('admin.common.earlier')}
                                        laterLabel={t('admin.common.later')}
                                        canEarlier={close - STEP >= open + STEP}
                                        canLater={close + STEP <= OPEN_TO}
                                        onEarlier={() =>
                                            patchDay(day.weekday, {
                                                close: fromMinutes(
                                                    close - STEP,
                                                ),
                                            })
                                        }
                                        onLater={() =>
                                            patchDay(day.weekday, {
                                                close: fromMinutes(
                                                    close + STEP,
                                                ),
                                            })
                                        }
                                    />
                                </>
                            ) : (
                                <span className="text-control text-subtle">
                                    {t('admin.settings.closed')}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="flex flex-col gap-3 pt-2">
                <h3 className="text-body font-semibold text-ink">
                    {t('admin.settings.holidays')}
                </h3>
                {holidays.length === 0 && (
                    <p className="text-control">
                        {t('admin.settings.noHolidays')}
                    </p>
                )}
                <div className="flex flex-col">
                    {holidays.map((item) => (
                        <div
                            key={item.date}
                            className="flex animate-fade items-center justify-between gap-3 border-b border-line-soft py-2.5 motion-reduce:animate-none"
                        >
                            <div className="flex flex-col">
                                <span className="text-control font-semibold text-ink">
                                    {item.name}
                                </span>
                                <span
                                    dir="ltr"
                                    className="text-start text-label"
                                >
                                    {item.date}
                                </span>
                            </div>
                            <Button
                                variant="outline-destructive"
                                size="sm"
                                aria-label={t('admin.settings.removeHolAria', {
                                    name: item.name,
                                })}
                                onClick={() =>
                                    patch({
                                        holidays: form.holidays.filter(
                                            (h) => h.date !== item.date,
                                        ),
                                    })
                                }
                            >
                                {t('admin.common.remove')}
                            </Button>
                        </div>
                    ))}
                </div>
                <form
                    onSubmit={addHoliday}
                    noValidate
                    className="flex flex-wrap items-end gap-3"
                >
                    <FormField
                        label={t('admin.settings.date')}
                        className="flex-[0_1_180px]"
                    >
                        {(control) => (
                            <Input
                                {...control}
                                type="date"
                                dir="ltr"
                                value={holiday.date}
                                onChange={(event) =>
                                    setHoliday({
                                        ...holiday,
                                        date: event.target.value,
                                        error: '',
                                    })
                                }
                            />
                        )}
                    </FormField>
                    <FormField
                        label={t('admin.settings.holName')}
                        className="min-w-[200px] flex-[1_1_200px]"
                    >
                        {(control) => (
                            <Input
                                {...control}
                                value={holiday.name}
                                onChange={(event) =>
                                    setHoliday({
                                        ...holiday,
                                        name: event.target.value,
                                        error: '',
                                    })
                                }
                            />
                        )}
                    </FormField>
                    <Button type="submit" variant="outline">
                        {t('admin.settings.addHol')}
                    </Button>
                </form>
                {holiday.error && (
                    <p
                        role="alert"
                        className="rounded-lg border border-danger-line bg-danger-surface px-3.5 py-2.5 text-control text-danger-deep"
                    >
                        {holiday.error}
                    </p>
                )}
            </div>
        </Card>
    );
}

function RemindersCard({ form, patch }: SectionProps) {
    const { t } = useT();
    const hoursLabel = (count: number) =>
        t('admin.settings.hoursBefore', { count });
    const available = REMINDER_CHOICES.filter(
        (hours) => !form.reminders.includes(hours),
    );
    const [pick, setPick] = useState(48);
    // Keep the choice on something that can still be added.
    const chosen = available.includes(pick) ? pick : (available[0] ?? pick);

    const cancelOptions = [...CANCEL_CHOICES];

    if (
        form.cancellationWindow !== null &&
        !cancelOptions.includes(form.cancellationWindow)
    ) {
        cancelOptions.push(form.cancellationWindow);
        cancelOptions.sort((a, b) => a - b);
    }

    const approvalLabel = useId();

    return (
        <Card aria-labelledby="reminders" className={SECTION}>
            <div className={INNER}>
                <CardTitle id="reminders">
                    {t('admin.settings.reminders')}
                </CardTitle>
                <p className="text-[14.5px]">{t('admin.settings.remSub')}</p>
            </div>
            <ul className="m-0 flex list-none flex-wrap gap-2.5 p-0">
                {sortReminders(form.reminders).map((hours) => (
                    <li
                        key={hours}
                        className="inline-flex min-h-11 animate-fade items-center gap-1 rounded-full border border-brand-line bg-brand-tint ps-4 pe-1 text-control font-semibold text-brand-deep motion-reduce:animate-none"
                    >
                        {hoursLabel(hours)}
                        <button
                            type="button"
                            aria-label={t('admin.settings.removeRemAria', {
                                label: hoursLabel(hours),
                            })}
                            onClick={() =>
                                patch({
                                    reminders: form.reminders.filter(
                                        (h) => h !== hours,
                                    ),
                                })
                            }
                            className="inline-flex size-11 items-center justify-center rounded-full"
                        >
                            <X aria-hidden="true" className="size-5" />
                        </button>
                    </li>
                ))}
            </ul>
            {form.reminders.length === 0 && (
                <p className="text-control">
                    {t('admin.settings.noReminders')}
                </p>
            )}
            <div className="flex flex-wrap items-end gap-3">
                <NativeSelect
                    label={t('admin.settings.addRem')}
                    fieldClassName="flex-[0_1_240px]"
                    value={String(chosen)}
                    disabled={available.length === 0}
                    onChange={(event) => setPick(Number(event.target.value))}
                    options={available.map((hours) => ({
                        value: String(hours),
                        label: hoursLabel(hours),
                    }))}
                />
                <Button
                    variant="outline"
                    disabled={available.length === 0}
                    onClick={() =>
                        patch({
                            reminders: sortReminders([
                                ...form.reminders,
                                chosen,
                            ]),
                        })
                    }
                >
                    {t('admin.settings.add')}
                </Button>
            </div>
            {available.length === 0 && (
                <p className="text-label text-subtle">
                    {t('admin.settings.allRemindersAdded')}
                </p>
            )}
            <NativeSelect
                label={t('admin.settings.cancelWin')}
                hint={t('admin.settings.cancelHint')}
                fieldClassName="max-w-[420px]"
                value={
                    form.cancellationWindow === null
                        ? 'none'
                        : String(form.cancellationWindow)
                }
                onChange={(event) =>
                    patch({
                        cancellationWindow:
                            event.target.value === 'none'
                                ? null
                                : Number(event.target.value),
                    })
                }
                options={[
                    { value: 'none', label: t('admin.settings.noLimit') },
                    ...cancelOptions.map((hours) => ({
                        value: String(hours),
                        label: hoursLabel(hours),
                    })),
                ]}
            />
            <div className="flex max-w-[620px] items-start gap-3 border-t border-line-soft pt-4">
                <ToggleSwitch
                    checked={form.approval}
                    labelledBy={approvalLabel}
                    onChange={(approval) => patch({ approval })}
                />
                <div className="flex flex-col gap-1 pt-2.5">
                    <span
                        id={approvalLabel}
                        className="text-control font-semibold text-ink"
                    >
                        {t('admin.settings.approval')}
                    </span>
                    <span className="text-small text-subtle">
                        {t('admin.settings.approvalHint')}
                    </span>
                </div>
            </div>
        </Card>
    );
}

function VoiceCard({ form, patch }: SectionProps) {
    const { t } = useT();
    const voiceLabel = useId();

    return (
        <Card aria-labelledby="voice-booking" className={SECTION}>
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex max-w-[560px] flex-col gap-1">
                    <CardTitle id="voice-booking">
                        {t('admin.settings.voice')}
                    </CardTitle>
                    <p className="text-[14.5px]">
                        {t('admin.settings.voiceSub')}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <span
                        id={voiceLabel}
                        className="text-control font-semibold text-ink"
                    >
                        {t(
                            form.voice
                                ? 'admin.settings.voiceOn'
                                : 'admin.settings.voiceOff',
                        )}
                    </span>
                    <ToggleSwitch
                        checked={form.voice}
                        labelledBy={voiceLabel}
                        onChange={(voice) => patch({ voice })}
                    />
                </div>
            </div>
            <NativeSelect
                label={t('admin.settings.retention')}
                hint={t(
                    form.voice
                        ? 'admin.settings.retentionHint'
                        : 'admin.settings.retentionOff',
                )}
                fieldClassName="max-w-[420px]"
                disabled={!form.voice}
                value={String(form.retention)}
                onChange={(event) =>
                    patch({ retention: Number(event.target.value) })
                }
                options={RETENTION_CHOICES.map((days) => ({
                    value: String(days),
                    label: t(`admin.settings.keep${days}`),
                }))}
            />
        </Card>
    );
}
