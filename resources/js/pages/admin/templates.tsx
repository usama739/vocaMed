import { Head } from '@inertiajs/react';
import { CircleCheck, Loader2, TriangleAlert } from 'lucide-react';
import {
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent,
} from 'react';
import {
    insertAtCursor,
    renderTemplate,
    smsLength,
    unknownVariables,
} from '@/components/admin/templates/message';
import { Segmented } from '@/components/admin/templates/segmented';
import {
    PageBody,
    PageError,
    PageHeader,
    PageLoading,
} from '@/components/reception/page-parts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/vocamed/form-fields';
import { notify } from '@/components/vocamed/toast';
import { useData } from '@/hooks/use-data';
import { useErrorText } from '@/hooks/use-error-text';
import { useLeaveGuard } from '@/hooks/use-leave-guard';
import { useView } from '@/hooks/use-view';
import { directionOf } from '@/i18n/locales';
import { useT } from '@/i18n/scope';
import type { Channel, Locale, NotificationKind } from '@/lib/data';
import { cn } from '@/lib/utils';

const KINDS: NotificationKind[] = [
    'confirmation',
    'reminder',
    'reschedule',
    'cancellation',
];

const keyOf = (kind: NotificationKind, channel: Channel, locale: Locale) =>
    `${kind}.${channel}.${locale}`;

export default function Templates() {
    const { t, isRtl } = useT();
    const source = useData();
    const { forField } = useErrorText();
    const query = useView('adminTemplates', undefined, { refreshMs: 0 });
    const view = query.data;

    const [kind, setKind] = useState<NotificationKind>('confirmation');
    const [channel, setChannel] = useState<Channel>('sms');
    const [msgLocale, setMsgLocale] = useState<Locale>('en');
    // Edited text per kind + channel + language. A draft that matches what is saved is not an edit.
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [serverError, setServerError] = useState<{
        key: string;
        message: string;
    } | null>(null);
    const [phone, setPhone] = useState('');
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{
        error?: string;
        sentTo?: string;
    } | null>(null);

    const area = useRef<HTMLTextAreaElement>(null);
    // The cursor is only trusted once the person has been in the box; until then variables go on the end.
    const touched = useRef(false);
    const pendingCaret = useRef<number | null>(null);

    useLayoutEffect(() => {
        const caret = pendingCaret.current;

        if (caret !== null && area.current) {
            area.current.focus();
            area.current.setSelectionRange(caret, caret);
            pendingCaret.current = null;
        }
    });

    const byKey = useMemo(
        () =>
            new Map(
                (view?.templates ?? []).map((template) => [
                    keyOf(template.kind, template.channel, template.locale),
                    template,
                ]),
            ),
        [view],
    );

    const key = keyOf(kind, channel, msgLocale);
    const current = byKey.get(key);
    const text = drafts[key] ?? current?.body ?? '';
    const dirtyKeys = Object.keys(drafts).filter(
        (k) => byKey.has(k) && drafts[k] !== byKey.get(k)?.body,
    );
    const dirty = dirtyKeys.includes(key);

    useLeaveGuard(dirtyKeys.length > 0, t('admin.common.leave'));

    const unknown = view ? unknownVariables(text, view.variables) : [];
    const empty = text.trim() === '';
    const blocked = empty || unknown.length > 0;
    const sample = view?.sample[msgLocale] ?? {};
    const preview = renderTemplate(text, sample);
    // The sample link ends in an ellipsis; a real short link is plain text, so count it as one.
    const sms = smsLength(preview.replaceAll('…', '...'));
    const msgDir = directionOf(msgLocale);

    const hasDraft = (test: (parts: string[]) => boolean) =>
        dirtyKeys.some((k) => test(k.split('.')));
    const unsavedNote = t('admin.templates.unsavedDot');

    const fieldError =
        unknown.length > 0
            ? t('admin.templates.unknownVar', { name: `{${unknown[0]}}` })
            : empty && drafts[key] !== undefined
              ? t('admin.templates.emptyError')
              : serverError?.key === key
                ? serverError.message
                : undefined;

    const change = (next: {
        kind?: NotificationKind;
        channel?: Channel;
        locale?: Locale;
    }) => {
        if (next.kind) {
            setKind(next.kind);
        }

        if (next.channel) {
            setChannel(next.channel);
        }

        if (next.locale) {
            setMsgLocale(next.locale);
        }

        touched.current = false;
        setTestResult(null);
    };

    const edit = (value: string) => {
        setDrafts((d) => ({ ...d, [key]: value }));
        setServerError(null);
        setTestResult(null);
    };

    const insert = (variable: string) => {
        const box = area.current;
        const selection =
            box && touched.current
                ? { start: box.selectionStart, end: box.selectionEnd }
                : null;
        const next = insertAtCursor(text, `{${variable}}`, selection);
        pendingCaret.current = next.caret;
        touched.current = true;
        edit(next.text);
    };

    const save = async () => {
        setSaving(true);

        try {
            await source.templates.save(
                { kind, channel, locale: msgLocale },
                text,
            );
            setDrafts(({ [key]: _saved, ...rest }) => {
                void _saved;

                return rest;
            });
            notify('success', t('admin.templates.saved'));
            query.reload();
        } catch (caught) {
            const { field, message } = forField(caught);

            if (field === 'body') {
                setServerError({ key, message });
            } else {
                notify('error', t('admin.templates.saveFailed'));
            }
        } finally {
            setSaving(false);
        }
    };

    const reset = async () => {
        if (!current) {
            return;
        }

        const restored = current.defaultBody;
        setServerError(null);
        setTestResult(null);

        if (!current.isCustom) {
            setDrafts(({ [key]: _gone, ...rest }) => {
                void _gone;

                return rest;
            });

            return;
        }

        // The saved wording is the clinic's own, so going back to the default is saved at once.
        setDrafts((d) => ({ ...d, [key]: restored }));
        setResetting(true);

        try {
            await source.templates.reset({
                kind,
                channel,
                locale: msgLocale,
            });
            notify('success', t('admin.templates.resetDone'));
            query.reload();
        } catch {
            notify('error', t('admin.templates.resetFailed'));
        } finally {
            setResetting(false);
        }
    };

    const sendTest = async () => {
        setTesting(true);
        setTestResult(null);

        try {
            const { sentTo } = await source.templates.testSend(
                { kind, channel, locale: msgLocale },
                text,
                phone,
            );
            setTestResult({ sentTo });
        } catch (caught) {
            const { field, message } = forField(caught);

            if (field === 'phone') {
                setTestResult({ error: message });
            } else {
                notify('error', t('admin.templates.testFailed'));
            }
        } finally {
            setTesting(false);
        }
    };

    const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
        const step =
            event.key === 'ArrowRight'
                ? isRtl
                    ? -1
                    : 1
                : event.key === 'ArrowLeft'
                  ? isRtl
                      ? 1
                      : -1
                  : 0;

        if (step === 0) {
            return;
        }

        event.preventDefault();
        const next =
            KINDS[(KINDS.indexOf(kind) + step + KINDS.length) % KINDS.length];
        change({ kind: next });
        document.getElementById(`template-tab-${next}`)?.focus();
    };

    return (
        <>
            <Head title={t('admin.templates.title')} />
            <PageBody>
                <PageHeader
                    title={t('admin.templates.title')}
                    lead={t('admin.templates.sub')}
                />

                {query.status === 'loading' && (
                    <PageLoading
                        label={t('admin.templates.loading')}
                        blocks={[48, 420]}
                    />
                )}
                {query.status === 'error' && (
                    <PageError onRetry={query.reload} />
                )}

                {query.status === 'ready' && view && current && (
                    <>
                        <div
                            role="tablist"
                            aria-label={t('admin.templates.title')}
                            className="flex flex-wrap gap-2"
                        >
                            {KINDS.map((tab) => {
                                const selected = kind === tab;

                                return (
                                    <button
                                        key={tab}
                                        id={`template-tab-${tab}`}
                                        type="button"
                                        role="tab"
                                        aria-selected={selected}
                                        aria-controls="template-panel"
                                        tabIndex={selected ? 0 : -1}
                                        onClick={() => change({ kind: tab })}
                                        onKeyDown={onTabKey}
                                        className={cn(
                                            'inline-flex min-h-12 items-center gap-2 rounded-md border px-5 text-control font-semibold transition-colors',
                                            selected
                                                ? 'border-brand bg-brand-tint text-brand-deep'
                                                : 'border-line-strong bg-white text-ink-soft hover:bg-surface-hover',
                                        )}
                                    >
                                        {t(`admin.templates.kinds.${tab}`)}
                                        {hasDraft((p) => p[0] === tab) && (
                                            <>
                                                <span
                                                    aria-hidden="true"
                                                    className="size-2 rounded-full bg-warning-accent"
                                                />{' '}
                                                <span className="sr-only">
                                                    {unsavedNote}
                                                </span>
                                            </>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="flex flex-wrap items-start gap-6">
                            <section
                                id="template-panel"
                                role="tabpanel"
                                aria-labelledby={`template-tab-${kind}`}
                                className="flex min-w-0 flex-[1_1_520px] animate-rise flex-col gap-[18px] rounded-xl border border-line bg-white p-6 motion-reduce:animate-none"
                            >
                                <div className="flex flex-wrap gap-x-7 gap-y-4">
                                    <Segmented
                                        label={t('admin.templates.channel')}
                                        value={channel}
                                        unsavedNote={unsavedNote}
                                        onChange={(value) =>
                                            change({ channel: value })
                                        }
                                        options={[
                                            {
                                                value: 'sms',
                                                label: t('admin.templates.sms'),
                                                unsaved: hasDraft(
                                                    (p) =>
                                                        p[0] === kind &&
                                                        p[1] === 'sms',
                                                ),
                                            },
                                            {
                                                value: 'whatsapp',
                                                label: t(
                                                    'admin.templates.whatsapp',
                                                ),
                                                unsaved: hasDraft(
                                                    (p) =>
                                                        p[0] === kind &&
                                                        p[1] === 'whatsapp',
                                                ),
                                            },
                                        ]}
                                    />
                                    <Segmented
                                        label={t('admin.templates.msgLang')}
                                        value={msgLocale}
                                        unsavedNote={unsavedNote}
                                        onChange={(value) =>
                                            change({ locale: value })
                                        }
                                        options={[
                                            {
                                                value: 'en',
                                                label: t(
                                                    'admin.templates.english',
                                                ),
                                                lang: 'en',
                                                unsaved: hasDraft(
                                                    (p) =>
                                                        p[0] === kind &&
                                                        p[2] === 'en',
                                                ),
                                            },
                                            {
                                                value: 'ur',
                                                label: t(
                                                    'admin.templates.urdu',
                                                ),
                                                lang: 'ur',
                                                unsaved: hasDraft(
                                                    (p) =>
                                                        p[0] === kind &&
                                                        p[2] === 'ur',
                                                ),
                                            },
                                        ]}
                                    />
                                </div>

                                {channel === 'whatsapp' && (
                                    <div
                                        role="note"
                                        className="flex items-start gap-2.5 rounded-lg border border-[#e3b341] bg-[#fff8e8] px-3.5 py-3 text-label font-medium text-[#5c3900]"
                                    >
                                        <TriangleAlert
                                            aria-hidden="true"
                                            className="mt-0.5 size-[18px] shrink-0"
                                        />
                                        <span>
                                            {t('admin.templates.waNote')}
                                        </span>
                                    </div>
                                )}

                                <div className="flex flex-col gap-1.5">
                                    <FormField
                                        label={t('admin.templates.message')}
                                        error={fieldError}
                                        labelAction={
                                            current.isCustom ? (
                                                <span className="rounded-full bg-brand-tint px-2.5 py-0.5 text-small font-semibold text-brand-deep">
                                                    {t(
                                                        'admin.templates.customised',
                                                    )}
                                                </span>
                                            ) : undefined
                                        }
                                    >
                                        {(control) => (
                                            <Textarea
                                                {...control}
                                                ref={area}
                                                rows={5}
                                                dir={msgDir}
                                                lang={msgLocale}
                                                value={text}
                                                onFocus={() => {
                                                    touched.current = true;
                                                }}
                                                onChange={(event) =>
                                                    edit(event.target.value)
                                                }
                                                className="leading-[1.6]"
                                            />
                                        )}
                                    </FormField>
                                    <div className="flex flex-wrap justify-between gap-2 text-[13.5px] text-subtle">
                                        <span>
                                            {channel === 'sms'
                                                ? `${t('admin.templates.counter', { count: sms.length })} · ${t('admin.templates.parts', { count: sms.parts })}`
                                                : t('admin.templates.counter', {
                                                      count: preview.length,
                                                  })}
                                        </span>
                                        {channel === 'sms' && (
                                            <span>
                                                {sms.unicode
                                                    ? t('admin.templates.uni')
                                                    : t('admin.templates.gsm')}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <span className="text-label font-semibold text-ink">
                                        {t('admin.templates.variables')}
                                    </span>
                                    <div className="flex flex-wrap gap-2">
                                        {view.variables.map((variable) => (
                                            <button
                                                key={variable}
                                                type="button"
                                                dir="ltr"
                                                onClick={() => insert(variable)}
                                                className="min-h-11 rounded-full border border-[#c9d6ee] bg-brand-tint px-3.5 font-mono text-[14px] font-semibold text-brand-deep transition-colors hover:bg-brand-wash"
                                            >
                                                {`{${variable}}`}
                                            </button>
                                        ))}
                                    </div>
                                    <span className="text-small text-subtle">
                                        {t('admin.templates.varHint')}
                                    </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-3 border-t border-line-soft pt-3.5">
                                    <Button
                                        variant="outline"
                                        disabled={
                                            text === current.defaultBody ||
                                            resetting ||
                                            saving
                                        }
                                        onClick={reset}
                                    >
                                        {t('admin.templates.reset')}
                                    </Button>
                                    <Button
                                        disabled={
                                            !dirty ||
                                            blocked ||
                                            saving ||
                                            resetting
                                        }
                                        onClick={save}
                                    >
                                        {saving && (
                                            <Loader2
                                                aria-hidden="true"
                                                className="animate-spin motion-reduce:animate-none"
                                            />
                                        )}
                                        {t('admin.templates.save')}
                                    </Button>
                                    {dirty && (
                                        <span
                                            role="status"
                                            className="animate-fade text-label font-semibold text-warning-ink motion-reduce:animate-none"
                                        >
                                            {t('admin.common.unsaved')}
                                        </span>
                                    )}
                                </div>
                            </section>

                            <section
                                aria-labelledby="template-preview"
                                className="flex min-w-0 flex-[1_1_340px] animate-rise flex-col gap-5 [animation-delay:60ms] motion-reduce:animate-none"
                            >
                                <div className="flex flex-col gap-3.5 rounded-xl border border-line bg-surface-subtle p-6">
                                    <div className="flex flex-col gap-0.5">
                                        <h2
                                            id="template-preview"
                                            className="text-lead font-semibold text-ink"
                                        >
                                            {t('admin.templates.previewTitle')}
                                        </h2>
                                        <span className="text-[13.5px] text-subtle">
                                            {t('admin.templates.previewSub')}
                                        </span>
                                    </div>
                                    <div
                                        role="region"
                                        aria-label={t(
                                            'admin.templates.previewAria',
                                        )}
                                        dir={msgDir}
                                        lang={msgLocale}
                                        className="max-w-[92%] self-start rounded-2xl border border-line bg-white px-4 py-3.5 text-body leading-[1.6] [overflow-wrap:anywhere] whitespace-pre-wrap text-ink shadow-xs"
                                    >
                                        {preview}
                                    </div>
                                </div>

                                <div className="flex flex-col gap-3.5 rounded-xl border border-line bg-white p-6">
                                    <h2 className="text-lead font-semibold text-ink">
                                        {t('admin.templates.test')}
                                    </h2>
                                    <FormField
                                        label={t('admin.templates.testPhone')}
                                        error={testResult?.error}
                                    >
                                        {(control) => (
                                            <Input
                                                {...control}
                                                type="tel"
                                                dir="ltr"
                                                placeholder="+92 300 0000000"
                                                value={phone}
                                                onChange={(event) => {
                                                    setPhone(
                                                        event.target.value,
                                                    );
                                                    setTestResult(null);
                                                }}
                                            />
                                        )}
                                    </FormField>
                                    <div>
                                        <Button
                                            variant="outline"
                                            disabled={blocked || testing}
                                            onClick={sendTest}
                                        >
                                            {testing && (
                                                <Loader2
                                                    aria-hidden="true"
                                                    className="animate-spin motion-reduce:animate-none"
                                                />
                                            )}
                                            {t('admin.templates.sendTest')}
                                        </Button>
                                    </div>
                                    {testResult?.sentTo && (
                                        <span
                                            role="status"
                                            className="inline-flex animate-fade items-center gap-2 text-label font-semibold text-[#14532d] motion-reduce:animate-none"
                                        >
                                            <CircleCheck
                                                aria-hidden="true"
                                                className="size-[18px]"
                                            />
                                            <span dir="auto">
                                                {t('admin.templates.testDone', {
                                                    phone: testResult.sentTo,
                                                })}
                                            </span>
                                        </span>
                                    )}
                                </div>
                            </section>
                        </div>
                    </>
                )}
            </PageBody>
        </>
    );
}
