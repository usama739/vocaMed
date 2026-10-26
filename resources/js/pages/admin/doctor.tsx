import { Head, router } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { SaveBar } from '@/components/admin/save-bar';
import { SignInAccess } from '@/components/admin/doctors/sign-in-access';
import { AvailabilityEditor } from '@/components/availability/availability-editor';
import { useAvailabilityEditor } from '@/components/availability/use-availability-editor';
import {
    Card,
    CardTitle,
    NotFoundPanel,
    PageBody,
    PageError,
    PageHeader,
    PageLoading,
    PatientAvatar,
    SampleNote,
} from '@/components/reception/page-parts';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/vocamed/confirm-dialog';
import { ChoiceChip } from '@/components/vocamed/choice-chip';
import { CheckboxField, FormField } from '@/components/vocamed/form-fields';
import { notify } from '@/components/vocamed/toast';
import { ToggleSwitch } from '@/components/vocamed/toggle-switch';
import { useData } from '@/hooks/use-data';
import { useErrorText } from '@/hooks/use-error-text';
import { useLeaveGuard } from '@/hooks/use-leave-guard';
import { useView } from '@/hooks/use-view';
import { useT } from '@/i18n/scope';
import type {
    AvailabilityDraft,
    DoctorLanguage,
    DoctorProfileDraft,
} from '@/lib/data';

const LANGUAGES: DoctorLanguage[] = ['en', 'ur', 'pa', 'ps'];

const keyOf = (profile: DoctorProfileDraft | null | undefined) =>
    JSON.stringify(profile ?? null);

/**
 * What the server keeps of a draft: a day that is off has no hours, so its hours are not compared.
 * (The saved record comes back with default hours for an off day; the edited copy still has the
 * hours it had, and the two must not count as a difference.)
 */
const availabilityKey = (draft: AvailabilityDraft) =>
    JSON.stringify({
        ...draft,
        days: draft.days.map((day) =>
            day.on ? day : { weekday: day.weekday, on: false },
        ),
    });

/**
 * D3. One page for a doctor who exists (`/admin/doctors/{id}`) and for a new one
 * (`/admin/doctors/new`). The form is keyed by the id, so after a new doctor is created the page
 * starts again on the saved record.
 */
export default function DoctorProfile({ id }: { id: string }) {
    return <DoctorForm key={id} id={id} />;
}

function DoctorForm({ id }: { id: string }) {
    const { t } = useT();
    const source = useData();
    const { forField, message } = useErrorText();
    const query = useView('adminDoctor', { doctorId: id }, { refreshMs: 0 });
    const view = query.data ?? undefined;
    const editor = useAvailabilityEditor(view, id);

    const [profile, setProfile] = useState<DoctorProfileDraft | null>(null);
    const base = useRef<DoctorProfileDraft | null>(null);
    const [justSaved, setJustSaved] = useState<string | null>(null);
    const [nameError, setNameError] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [confirmOff, setConfirmOff] = useState(false);

    // The page edits its own copy; a reload only replaces it when nothing was edited.
    useEffect(() => {
        if (!view) {
            return;
        }

        const previous = base.current;
        base.current = view.profile;
        setProfile((current) =>
            current === null || keyOf(current) === keyOf(previous)
                ? view.profile
                : current,
        );
        setJustSaved(null);
    }, [view]);

    const isNew = id === 'new';
    const profileDirty =
        profile !== null &&
        keyOf(profile) !== (justSaved ?? keyOf(view?.profile));
    const availabilityDirty =
        editor.dirty &&
        !!editor.draft &&
        !!view &&
        availabilityKey(editor.draft) !== availabilityKey(view.draft);
    const dirty = profileDirty || availabilityDirty;

    useLeaveGuard(dirty, t('admin.common.leave'));

    const edit = (patch: Partial<DoctorProfileDraft>) => {
        setSaved(false);
        setProfile((p) => (p ? { ...p, ...patch } : p));
    };

    const toggle = <T,>(list: T[], item: T) =>
        list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

    const save = async () => {
        if (!profile || !editor.draft || !view) {
            return;
        }

        if (!profile.name.trim()) {
            setNameError(t('admin.doctor.errName'));

            return;
        }

        setSaving(true);

        try {
            const input = { profile, availability: editor.draft };

            if (view.id === null) {
                const created = await source.doctors.create(input);
                // Settle "nothing unsaved" before leaving, so the leave guard stays quiet.
                flushSync(() => {
                    editor.markSaved();
                    setJustSaved(keyOf(profile));
                });
                notify('success', t('admin.doctor.created'));
                router.visit(`/admin/doctors/${created.id}`, { replace: true });

                return;
            }

            await source.doctors.save(view.id, input);
            editor.markSaved();
            setJustSaved(keyOf(profile));
            setSaved(true);
            notify('success', t('admin.doctor.saved'));
            query.reload();
        } catch (caught) {
            const { field } = forField(caught);

            if (field === 'name') {
                setNameError(t('admin.doctor.errName'));
            } else {
                notify('error', message(caught));
            }
        } finally {
            setSaving(false);
        }
    };

    const discard = () => {
        setNameError('');
        setSaved(false);

        if (view) {
            setProfile(view.profile);
            setJustSaved(null);
        }

        editor.discard();
    };

    const heading = isNew
        ? t('admin.doctor.newTitle')
        : profile?.name || view?.profile.name || t('admin.doctor.crumb');
    const noHours = !!editor.draft && editor.draft.days.every((d) => !d.on);
    const label = profile?.active
        ? t('admin.doctor.accepting')
        : t('admin.doctor.notAccepting');

    return (
        <>
            <Head title={heading} />
            <PageBody>
                {query.status === 'ready' && query.data === null ? (
                    <NotFoundPanel
                        title={t('admin.common.notFoundTitle')}
                        body={t('admin.common.notFoundBody')}
                        backHref="/admin/doctors"
                        backLabel={t('admin.doctor.back')}
                    />
                ) : (
                    <>
                        <PageHeader
                            title={heading}
                            lead={
                                isNew
                                    ? t('admin.doctor.newSub')
                                    : profile?.specialty || undefined
                            }
                            leading={
                                <PatientAvatar
                                    name={isNew ? '+' : heading}
                                    size="lg"
                                />
                            }
                            actions={
                                profile && (
                                    <div className="flex items-center gap-3">
                                        <span
                                            id="doctor-active-label"
                                            className="text-control font-semibold text-ink"
                                        >
                                            {label}
                                        </span>
                                        <ToggleSwitch
                                            checked={profile.active}
                                            labelledBy="doctor-active-label"
                                            onChange={(next) =>
                                                !next &&
                                                view?.id &&
                                                view.upcoming > 0
                                                    ? setConfirmOff(true)
                                                    : edit({ active: next })
                                            }
                                        />
                                    </div>
                                )
                            }
                        />

                        {query.status === 'loading' && (
                            <PageLoading
                                label={t('admin.doctor.loading')}
                                blocks={[260, 520, 200]}
                            />
                        )}
                        {query.status === 'error' && (
                            <PageError onRetry={query.reload} />
                        )}

                        {query.status === 'ready' &&
                            view &&
                            profile &&
                            editor.draft && (
                                <>
                                    {!profile.active && (
                                        <p
                                            role="note"
                                            className="rounded-lg border border-line bg-surface-subtle px-4 py-3 text-control text-ink"
                                        >
                                            {t('admin.doctor.inactiveNote')}
                                        </p>
                                    )}

                                    <Card
                                        aria-labelledby="doctor-profile"
                                        className="flex animate-rise flex-col gap-5 p-6 motion-reduce:animate-none"
                                    >
                                        <CardTitle id="doctor-profile">
                                            {t('admin.doctor.profile')}
                                        </CardTitle>
                                        <div className="grid [grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-[18px]">
                                            <FormField
                                                label={t('admin.doctor.name')}
                                                error={nameError || undefined}
                                            >
                                                {(control) => (
                                                    <Input
                                                        {...control}
                                                        value={profile.name}
                                                        placeholder={t(
                                                            'admin.doctor.namePh',
                                                        )}
                                                        onChange={(event) => {
                                                            setNameError('');
                                                            edit({
                                                                name: event
                                                                    .target
                                                                    .value,
                                                            });
                                                        }}
                                                    />
                                                )}
                                            </FormField>
                                            <FormField
                                                label={t(
                                                    'admin.doctor.specialty',
                                                )}
                                            >
                                                {(control) => (
                                                    <Input
                                                        {...control}
                                                        value={
                                                            profile.specialty
                                                        }
                                                        placeholder={t(
                                                            'admin.doctor.specialtyPh',
                                                        )}
                                                        onChange={(event) =>
                                                            edit({
                                                                specialty:
                                                                    event.target
                                                                        .value,
                                                            })
                                                        }
                                                    />
                                                )}
                                            </FormField>
                                        </div>

                                        <fieldset className="flex min-w-0 flex-col gap-2.5">
                                            <legend className="mb-2.5 text-label font-semibold text-ink">
                                                {t('admin.doctor.languages')}
                                            </legend>
                                            <div className="flex flex-wrap gap-2.5">
                                                {LANGUAGES.map((code) => (
                                                    <ChoiceChip
                                                        key={code}
                                                        shape="pill"
                                                        pressed={profile.languages.includes(
                                                            code,
                                                        )}
                                                        onClick={() =>
                                                            edit({
                                                                languages:
                                                                    toggle(
                                                                        profile.languages,
                                                                        code,
                                                                    ),
                                                            })
                                                        }
                                                    >
                                                        {t(
                                                            `admin.doctor.lang.${code}`,
                                                        )}
                                                    </ChoiceChip>
                                                ))}
                                            </div>
                                        </fieldset>

                                        <fieldset className="flex min-w-0 flex-col gap-1">
                                            <legend className="mb-2 text-label font-semibold text-ink">
                                                {t('admin.doctor.services')}
                                            </legend>
                                            {view.services.length === 0 ? (
                                                <p className="text-control">
                                                    {t(
                                                        'admin.doctor.noServices',
                                                    )}
                                                </p>
                                            ) : (
                                                <div className="grid [grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-x-[18px]">
                                                    {view.services.map(
                                                        (service) => (
                                                            <CheckboxField
                                                                key={service.id}
                                                                checked={profile.serviceIds.includes(
                                                                    service.id,
                                                                )}
                                                                onCheckedChange={() =>
                                                                    edit({
                                                                        serviceIds:
                                                                            toggle(
                                                                                profile.serviceIds,
                                                                                service.id,
                                                                            ),
                                                                    })
                                                                }
                                                                label={
                                                                    <>
                                                                        {
                                                                            service.name
                                                                        }{' '}
                                                                        <span className="text-small text-subtle">
                                                                            ·{' '}
                                                                            {t(
                                                                                'admin.common.min',
                                                                                {
                                                                                    count: service.durationMin,
                                                                                },
                                                                            )}
                                                                            {!service.active &&
                                                                                ` · ${t('admin.doctor.inactiveService')}`}
                                                                        </span>
                                                                    </>
                                                                }
                                                            />
                                                        ),
                                                    )}
                                                </div>
                                            )}
                                        </fieldset>
                                    </Card>

                                    <section
                                        aria-labelledby="doctor-availability"
                                        className="flex flex-col gap-4"
                                    >
                                        <div className="flex flex-col gap-1">
                                            <h2
                                                id="doctor-availability"
                                                className="text-title font-semibold text-ink"
                                            >
                                                {t('admin.doctor.availability')}
                                            </h2>
                                            <p className="text-control">
                                                {t(
                                                    'admin.doctor.availabilitySub',
                                                )}
                                            </p>
                                        </div>
                                        {noHours && (
                                            <p
                                                role="note"
                                                className="rounded-lg border border-warning-line bg-warning-surface px-4 py-3 text-control text-warning-ink"
                                            >
                                                {t('admin.doctor.noHours')}
                                            </p>
                                        )}
                                        <AvailabilityEditor
                                            editor={editor}
                                            timezone={view.clinic.timezone}
                                        />
                                    </section>

                                    <SignInAccess
                                        doctorId={view.id}
                                        signIn={view.signIn}
                                        onChanged={query.reload}
                                    />

                                    <SaveBar
                                        dirty={dirty}
                                        saving={saving}
                                        saved={saved}
                                        onSave={save}
                                        onDiscard={discard}
                                        saveLabel={
                                            dirty && editor.affected.length > 0
                                                ? t(
                                                      'doctor.availability.saveAnyway',
                                                  )
                                                : isNew
                                                  ? t('admin.doctor.add')
                                                  : t('admin.doctor.save')
                                        }
                                        savedLabel={t('admin.doctor.saved')}
                                    />
                                </>
                            )}
                    </>
                )}

                <SampleNote />
            </PageBody>

            <ConfirmDialog
                open={confirmOff}
                onOpenChange={setConfirmOff}
                title={t('admin.doctor.confirmTitle', {
                    name: profile?.name ?? '',
                })}
                description={t('admin.doctor.confirmBody', {
                    count: view?.upcoming ?? 0,
                })}
                confirmLabel={t('admin.doctor.confirmButton')}
                cancelLabel={t('admin.common.cancel')}
                onConfirm={() => edit({ active: false })}
            />
        </>
    );
}
