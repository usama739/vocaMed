import { Check, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PhoneField, TextField } from '@/components/vocamed/form-fields';
import { useAsyncValue } from '@/hooks/use-async-value';
import { useT } from '@/i18n/scope';
import type { DataSource, Patient } from '@/lib/data';
import { cn } from '@/lib/utils';

/**
 * Debounced patient lookup: phone matches first, then name, with recent patients shown before
 * anyone types. "New patient" opens name and phone fields right here, with the clinic's
 * country code in front.
 */
export function PatientPicker({
    source,
    countryCode,
    selected,
    onSelect,
    creating,
    onCreatingChange,
    newName,
    onNewNameChange,
    newPhone,
    onNewPhoneChange,
}: {
    source: DataSource;
    countryCode: string;
    selected: Patient | null;
    onSelect: (patient: Patient | null) => void;
    creating: boolean;
    onCreatingChange: (creating: boolean) => void;
    newName: string;
    onNewNameChange: (name: string) => void;
    newPhone: string;
    onNewPhoneChange: (e164: string) => void;
}) {
    const { t } = useT();
    const [query, setQuery] = useState('');
    const [debounced, setDebounced] = useState('');

    useEffect(() => {
        const timer = window.setTimeout(() => setDebounced(query.trim()), 250);

        return () => window.clearTimeout(timer);
    }, [query]);

    const { value: found } = useAsyncValue(`patients:${debounced}`, () =>
        debounced
            ? source.patients.search(debounced, 5)
            : source.patients.recent(3),
    );
    // A patient chosen before the picker opened (from their profile) is always listed.
    const results =
        selected && found && !found.some((p) => p.id === selected.id)
            ? [selected, ...found]
            : found;

    return (
        <div className="flex flex-col gap-1.5">
            <TextField
                label={t('booking.findPatient')}
                type="search"
                value={query}
                placeholder={t('booking.findPlaceholder')}
                onChange={(event) => setQuery(event.target.value)}
            />
            <ul className="mt-1 flex flex-col gap-1.5">
                {(results ?? []).map((patient) => {
                    const on = selected?.id === patient.id;

                    return (
                        <li key={patient.id}>
                            <button
                                type="button"
                                aria-pressed={on}
                                onClick={() => {
                                    onSelect(patient);
                                    onCreatingChange(false);
                                }}
                                className={cn(
                                    'flex min-h-[52px] w-full items-center justify-between gap-2.5 rounded-md border px-3.5 text-start text-control text-ink',
                                    on
                                        ? 'border-brand bg-brand-tint'
                                        : 'border-line bg-white hover:bg-surface-hover',
                                )}
                            >
                                <span className="inline-flex items-center gap-1.5 font-semibold">
                                    {on && (
                                        <Check
                                            aria-hidden="true"
                                            className="size-4 shrink-0"
                                            strokeWidth={3}
                                        />
                                    )}
                                    {patient.name}
                                </span>
                                <span dir="ltr" className="text-small">
                                    {patient.phone}
                                </span>
                            </button>
                        </li>
                    );
                })}
                <li>
                    <button
                        type="button"
                        aria-pressed={creating}
                        onClick={() => {
                            onCreatingChange(!creating);
                            onSelect(null);
                        }}
                        className="inline-flex min-h-12 w-full items-center gap-2 rounded-md border border-dashed border-line-dashed bg-white px-3.5 text-start text-control font-semibold text-brand-hover hover:bg-surface-hover"
                    >
                        <Plus aria-hidden="true" className="size-4" />
                        {t('booking.newPatient')}
                    </button>
                </li>
            </ul>
            {creating && (
                <div className="mt-2 flex flex-col gap-3.5 rounded-xl border border-line p-4">
                    <TextField
                        label={t('booking.newPatientName')}
                        value={newName}
                        onChange={(event) =>
                            onNewNameChange(event.target.value)
                        }
                        autoComplete="off"
                    />
                    <PhoneField
                        label={t('booking.phone')}
                        countryCode={countryCode}
                        value={newPhone}
                        onValueChange={onNewPhoneChange}
                    />
                </div>
            )}
        </div>
    );
}
