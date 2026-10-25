import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChoiceChip } from '@/components/vocamed/choice-chip';
import {
    ConfirmDialog,
    ConfirmDialogCard,
} from '@/components/vocamed/confirm-dialog';
import {
    DataTable,
    FilterBar,
    FilterRow,
    Pagination,
    ResultCount,
    RowActionsMenu,
    SearchInput,
    type Column,
    type SortState,
} from '@/components/vocamed/data-table';
import {
    CheckboxField,
    PasswordField,
    PhoneField,
    SelectField,
    TextareaField,
    TextField,
} from '@/components/vocamed/form-fields';
import {
    EmptyState,
    ErrorState,
    LoadingState,
    ReconnectingBanner,
} from '@/components/vocamed/states';
import { StatusBadge } from '@/components/vocamed/status-badge';
import { notify, ToastCard, type ToastTone } from '@/components/vocamed/toast';
import type { Locale } from '@/i18n/locales';
import { LocaleScope, useT } from '@/i18n/scope';
import { COPY } from '@/preview/copy';
import { Bilingual, Caption, SampleLabel, Section } from '@/preview/shared';

// ---- Confirm dialog ----

export function DialogSection() {
    const [open, setOpen] = useState<Locale | null>(null);

    return (
        <Section
            id="confirm-dialog"
            title="Confirm dialog"
            note="For destructive actions. It is an alert dialog: focus starts on the safe choice (Keep), Escape cancels, and the confirm button disables itself while an async action runs."
        >
            <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={() => setOpen('en')}>
                    Open dialog (English)
                </Button>
                <Button variant="outline" onClick={() => setOpen('ur')}>
                    Open dialog (Urdu)
                </Button>
            </div>
            {(['en', 'ur'] as const).map((locale) => (
                <LocaleScope key={locale} locale={locale}>
                    <ConfirmDialog
                        open={open === locale}
                        onOpenChange={(next) => setOpen(next ? locale : null)}
                        title={COPY[locale].dialog.title}
                        description={COPY[locale].dialog.body}
                        confirmLabel={COPY[locale].dialog.confirm}
                        cancelLabel={COPY[locale].dialog.keep}
                        onConfirm={() =>
                            new Promise((resolve) => setTimeout(resolve, 600))
                        }
                    />
                </LocaleScope>
            ))}
            <Bilingual>
                <DialogInline />
            </Bilingual>
        </Section>
    );
}

function DialogInline() {
    const { locale } = useT();
    const copy = COPY[locale].dialog;

    return (
        <div className="rounded-2xl border border-line bg-white p-7 shadow-modal">
            <ConfirmDialogCard
                inline
                title={copy.title}
                description={copy.body}
                confirmLabel={copy.confirm}
                cancelLabel={copy.keep}
            />
        </div>
    );
}

// ---- Toast ----

const TONES: ToastTone[] = ['success', 'error', 'warning', 'info'];

function ToastInline() {
    const { locale } = useT();

    return (
        <ul className="flex flex-col gap-3">
            {TONES.map((tone) => (
                <li key={tone}>
                    <ToastCard
                        tone={tone}
                        message={COPY[locale].toast[tone]}
                        onDismiss={() => undefined}
                    />
                </li>
            ))}
        </ul>
    );
}

export function ToastSection() {
    return (
        <Section
            id="toast"
            title="Toast"
            note="Success, error, warning and info. Each has an icon and text, and a 44px dismiss button. Errors stay until dismissed; the others clear after five seconds."
        >
            <div className="flex flex-wrap gap-3">
                {TONES.map((tone) => (
                    <Button
                        key={`${tone}-en`}
                        variant="outline"
                        onClick={() =>
                            notify(tone, COPY.en.toast[tone], { locale: 'en' })
                        }
                    >
                        Fire {tone} (English)
                    </Button>
                ))}
                {TONES.map((tone) => (
                    <Button
                        key={`${tone}-ur`}
                        variant="outline"
                        onClick={() =>
                            notify(tone, COPY.ur.toast[tone], { locale: 'ur' })
                        }
                    >
                        Fire {tone} (Urdu)
                    </Button>
                ))}
            </div>
            <Bilingual>
                <ToastInline />
            </Bilingual>
        </Section>
    );
}

// ---- Empty, loading, error, reconnecting ----

function StatesInline() {
    const { locale } = useT();
    const copy = COPY[locale].empty;

    return (
        <div className="flex flex-col gap-5">
            <div className="rounded-xl border border-line">
                <EmptyState
                    title={copy.title}
                    description={copy.body}
                    action={<Button variant="outline">{copy.action}</Button>}
                />
            </div>
            <div className="rounded-xl border border-line">
                <LoadingState rows={3} />
            </div>
            <div className="rounded-xl border border-line">
                <ErrorState onRetry={() => undefined} />
            </div>
            <div className="overflow-hidden rounded-xl border border-warning-line">
                <ReconnectingBanner className="border-b-0" />
            </div>
        </div>
    );
}

export function StatesSection() {
    return (
        <Section
            id="states"
            title="Empty, loading, error and reconnecting"
            note="The four states every page handles: an empty state with a next action, a loading skeleton, an error with Retry, and the banner shown while the live connection is down."
        >
            <Bilingual>
                <StatesInline />
            </Bilingual>
        </Section>
    );
}

// ---- Form fields ----

function FormsInline() {
    const { locale, t } = useT();
    const copy = COPY[locale].form;
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [doctor, setDoctor] = useState<string>();
    const [remember, setRemember] = useState(true);
    const [channel, setChannel] = useState<'sms' | 'whatsapp'>('sms');

    return (
        <div className="flex flex-col gap-5">
            <TextField
                label={copy.name}
                hint={copy.nameHint}
                value={name}
                onChange={(event) => setName(event.target.value)}
            />
            <TextField
                label={copy.name}
                error={copy.nameError}
                defaultValue=""
            />
            <TextField
                label={copy.email}
                hint={copy.emailHint}
                type="email"
                dir="ltr"
                placeholder="name@yourclinic.com"
            />
            <TextField
                label={copy.reason}
                optional
                defaultValue={copy.reasonSample}
            />
            <TextField label={copy.disabled} disabled defaultValue="—" />
            <PasswordField label={t('shell.account')} defaultValue="sample" />
            <PhoneField
                label={t('booking.phone')}
                value={phone}
                onValueChange={setPhone}
                hint={phone || undefined}
            />
            <TextareaField label={copy.notes} rows={3} optional />
            <SelectField
                label={copy.doctor}
                placeholder={copy.choose}
                value={doctor}
                onValueChange={setDoctor}
                options={[
                    {
                        value: 'a',
                        label: locale === 'ur' ? 'ڈاکٹر رحمان' : 'Dr. Rahman',
                    },
                    {
                        value: 'b',
                        label: locale === 'ur' ? 'ڈاکٹر خان' : 'Dr. Khan',
                    },
                ]}
            />
            <div
                role="group"
                aria-label={copy.channel}
                className="flex flex-col gap-1.5"
            >
                <span className="text-label font-semibold text-ink">
                    {copy.channel}
                </span>
                <div className="flex flex-wrap gap-2">
                    <ChoiceChip
                        pressed={channel === 'sms'}
                        onClick={() => setChannel('sms')}
                    >
                        {copy.viaPhone}
                    </ChoiceChip>
                    <ChoiceChip
                        pressed={channel === 'whatsapp'}
                        onClick={() => setChannel('whatsapp')}
                    >
                        {copy.viaWhatsapp}
                    </ChoiceChip>
                </div>
            </div>
            <CheckboxField
                label={copy.remember}
                checked={remember}
                onCheckedChange={setRemember}
            />
            <SampleLabel />
        </div>
    );
}

export function FormsSection() {
    return (
        <Section
            id="form-fields"
            title="Form fields"
            note="Label, control, hint and inline error are wired together (aria-describedby, aria-invalid). Errors have an icon, not only red text. Inputs are 48px tall and 16px so phones do not zoom. Phone numbers are stored in international format with the clinic's country code."
        >
            <Bilingual>
                <FormsInline />
            </Bilingual>
        </Section>
    );
}

// ---- Table pattern ----

type Row = (typeof COPY)['en']['rows'][number];

function TableInline({ menu = false }: { menu?: boolean }) {
    const { locale, t } = useT();
    const copy = COPY[locale].table;
    const all = COPY[locale].rows;
    const [query, setQuery] = useState('');
    const [doctor, setDoctor] = useState('all');
    const [sort, setSort] = useState<SortState>(null);
    const [page, setPage] = useState(1);
    const perPage = 4;

    const doctors = [...new Set(all.map((r) => r.doctor))];
    const filtered = all
        .filter((r) => doctor === 'all' || r.doctor === doctor)
        .filter(
            (r) =>
                !query ||
                r.patient.toLowerCase().includes(query.toLowerCase()) ||
                r.phone.replace(/\s/g, '').includes(query.replace(/\s/g, '')),
        );

    if (sort) {
        filtered.sort((a, b) => {
            const left =
                sort.key === 'patient' ? a.patient : `${a.id.padStart(2, '0')}`;
            const right =
                sort.key === 'patient' ? b.patient : `${b.id.padStart(2, '0')}`;

            return (
                (sort.direction === 'asc' ? 1 : -1) * left.localeCompare(right)
            );
        });
    }

    const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
    const current = Math.min(page, pageCount);
    const rows = filtered.slice((current - 1) * perPage, current * perPage);

    const columns: Column<Row>[] = [
        {
            key: 'when',
            header: copy.when,
            sortable: true,
            cell: (r) => (
                <div className="flex flex-col leading-snug">
                    <span className="font-semibold">{r.day}</span>
                    <span dir="ltr" className="text-start text-small text-copy">
                        {r.time}
                    </span>
                </div>
            ),
        },
        {
            key: 'patient',
            header: copy.patient,
            sortable: true,
            cell: (r) => (
                <div className="flex flex-col leading-snug">
                    <span className="font-semibold">{r.patient}</span>
                    <span dir="ltr" className="text-start text-small text-copy">
                        {r.phone}
                    </span>
                </div>
            ),
        },
        { key: 'doctor', header: copy.doctorCol, cell: (r) => r.doctor },
        {
            key: 'status',
            header: copy.statusCol,
            cell: (r) => <StatusBadge status={r.status} />,
        },
    ];

    return (
        <div className="flex flex-col gap-4">
            <FilterBar>
                <SearchInput
                    label={copy.search}
                    value={query}
                    onChange={(value) => {
                        setQuery(value);
                        setPage(1);
                    }}
                />
                <FilterRow label={copy.doctor}>
                    {['all', ...doctors].map((d) => (
                        <ChoiceChip
                            key={d}
                            shape="pill"
                            pressed={doctor === d}
                            onClick={() => {
                                setDoctor(d);
                                setPage(1);
                            }}
                        >
                            {d === 'all' ? copy.all : d}
                        </ChoiceChip>
                    ))}
                </FilterRow>
            </FilterBar>
            <ResultCount count={filtered.length} />
            <DataTable
                label={copy.title}
                columns={columns}
                rows={rows}
                rowKey={(r) => r.id}
                sort={sort}
                onSortChange={setSort}
                actionsHeader={copy.actions}
                onClearFilters={() => {
                    setQuery('');
                    setDoctor('all');
                }}
                actions={(r) =>
                    menu ? (
                        <RowActionsMenu
                            items={[
                                { label: copy.view, onSelect: () => undefined },
                                {
                                    label: copy.reschedule,
                                    onSelect: () => undefined,
                                },
                                {
                                    label: copy.cancel,
                                    onSelect: () => undefined,
                                    destructive: true,
                                },
                            ]}
                        />
                    ) : (
                        <>
                            <Button variant="outline" size="sm">
                                {copy.view}
                            </Button>
                            {(r.status === 'booked' ||
                                r.status === 'confirmed') && (
                                <>
                                    <Button variant="outline" size="sm">
                                        {copy.reschedule}
                                    </Button>
                                    <Button
                                        variant="outline-destructive"
                                        size="sm"
                                    >
                                        {copy.cancel}
                                    </Button>
                                </>
                            )}
                        </>
                    )
                }
            />
            <Pagination
                page={current}
                pageCount={pageCount}
                onPageChange={setPage}
            />
            <p className="text-small text-subtle">{t('common.sample')}</p>
        </div>
    );
}

function TableStates() {
    const { locale } = useT();
    const copy = COPY[locale].table;
    const columns: Column<Row>[] = [
        { key: 'patient', header: copy.patient, cell: (r) => r.patient },
        {
            key: 'status',
            header: copy.statusCol,
            cell: (r) => <StatusBadge status={r.status} />,
        },
    ];

    return (
        <div className="flex flex-col gap-4">
            {(['loading', 'error', 'empty'] as const).map((state) => (
                <DataTable
                    key={state}
                    label={`${copy.title} ${state}`}
                    columns={columns}
                    rows={[]}
                    rowKey={(r) => r.id}
                    status={state === 'empty' ? 'ready' : state}
                    onRetry={() => undefined}
                    onClearFilters={() => undefined}
                    className="[&_table]:min-w-0"
                />
            ))}
        </div>
    );
}

export function TableSection() {
    return (
        <Section
            id="table"
            title="Table pattern"
            note="Search and filter bar, result count, sortable table, pagination, and the loading, error and empty states. Actions are inline buttons (as designed) or a row-actions menu. The first table is fully interactive: search, filter, sort and page."
        >
            <div className="flex flex-col gap-3">
                <Caption>Inline row actions</Caption>
                <Bilingual>
                    <TableInline />
                </Bilingual>
            </div>
            <div className="flex flex-col gap-3">
                <Caption>Row-actions menu</Caption>
                <Bilingual>
                    <TableInline menu />
                </Bilingual>
            </div>
            <div className="flex flex-col gap-3">
                <Caption>Loading, error and empty</Caption>
                <Bilingual>
                    <TableStates />
                </Bilingual>
            </div>
        </Section>
    );
}
