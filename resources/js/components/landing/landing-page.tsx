import { Link } from '@inertiajs/react';
import {
    CalendarCheck,
    Check,
    CircleCheck,
    FileText,
    MapPin,
    Mic,
    Play,
    Monitor,
    SlidersHorizontal,
    Smartphone,
    Activity,
    Bell,
    ShieldCheck,
    Zap,
    type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { FaqAccordion } from '@/components/landing/faq-accordion';
import {
    RequestDemoDialog,
    WatchDemoDialog,
} from '@/components/landing/demo-dialogs';
import { HeroDemo } from '@/components/landing/hero-demo';
import { Placeholders } from '@/components/public/placeholders';
import {
    marketingOnNavy,
    marketingPrimary,
    marketingSecondary,
} from '@/components/public/marketing';
import { PublicLayout, Wordmark } from '@/components/public/public-layout';
import { Reveal } from '@/components/public/reveal';
import { Button } from '@/components/ui/button';
import {
    BADGE_STATUSES,
    StatusBadge,
    type BadgeStatus,
} from '@/components/vocamed/status-badge';
import { useT } from '@/i18n/scope';
import { cn } from '@/lib/utils';

const APPOINTMENT_STATUSES = BADGE_STATUSES.slice(0, 7) as Extract<
    BadgeStatus,
    | 'booked'
    | 'confirmed'
    | 'arrived'
    | 'in_consultation'
    | 'done'
    | 'cancelled'
    | 'no_show'
>[];

function Section({
    id,
    subtle = false,
    children,
}: {
    id?: string;
    subtle?: boolean;
    children: ReactNode;
}) {
    return (
        <section
            id={id}
            className={cn(
                'scroll-mt-20',
                subtle ? 'bg-surface-subtle' : 'bg-white',
            )}
        >
            {children}
        </section>
    );
}

const wrap = 'mx-auto w-full max-w-[1200px] px-6';

function SectionHead({ title, sub }: { title: string; sub?: ReactNode }) {
    return (
        <Reveal className="flex max-w-[680px] flex-col gap-3">
            <h2 className="text-section font-bold text-balance text-ink ltr:tracking-[-0.02em] rtl:tracking-normal">
                {title}
            </h2>
            {sub && <p className="text-lead">{sub}</p>}
        </Reveal>
    );
}

const card =
    'group rounded-[20px] border border-line/70 bg-white shadow-soft transition-[transform,box-shadow,border-color] duration-300 ease-out-soft hover:-translate-y-1 hover:border-brand-line hover:shadow-float motion-reduce:hover:translate-y-0';

function IconTile({
    icon: Icon,
    size = 'md',
}: {
    icon: LucideIcon;
    size?: 'md' | 'lg';
}) {
    return (
        <span
            aria-hidden="true"
            className={cn(
                'inline-flex items-center justify-center rounded-xl bg-brand-tint text-brand-hover transition-colors duration-300 group-hover:bg-brand group-hover:text-white',
                size === 'lg' ? 'size-12' : 'size-11',
            )}
        >
            <Icon
                className={size === 'lg' ? 'size-6' : 'size-[22px]'}
                strokeWidth={2}
            />
        </span>
    );
}

// Written out in full: Tailwind only generates classes it can find literally in the source.
const GRID_320 =
    'grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]';
const GRID_250 =
    'grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(250px,100%),1fr))]';

/** A1. The landing page. Sections follow the design; copy and placeholders are in the message files. */
export function LandingPage() {
    const { t } = useT();
    const [dialog, setDialog] = useState<'watch' | 'request' | null>(null);

    const links = [
        { href: '#how', label: t('landing.nav.how') },
        { href: '#benefits', label: t('landing.nav.benefits') },
        { href: '#plans', label: t('landing.nav.plans') },
        { href: '#faq', label: t('landing.nav.faq') },
    ];

    const benefits = [
        { key: 'b1', icon: Zap },
        { key: 'b2', icon: CalendarCheck },
        { key: 'b3', icon: Bell },
    ] as const;
    const steps = ['s1', 's2', 's3'] as const;
    const roles = [
        { key: 'r1', icon: Monitor },
        { key: 'r2', icon: SlidersHorizontal },
        { key: 'r3', icon: Activity },
        { key: 'r4', icon: Smartphone },
    ] as const;
    const trust = [
        { key: 't1', icon: FileText },
        { key: 't2', icon: ShieldCheck },
        { key: 't3', icon: Mic },
    ] as const;
    const faq = (['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'] as const).map(
        (id) => ({
            id,
            q: t(`landing.faq.${id}.q`),
            a: t(`landing.faq.${id}.a`),
        }),
    );

    return (
        <PublicLayout
            variant="marketing"
            sticky
            links={links}
            footer={<LandingFooter onRequest={() => setDialog('request')} />}
        >
            {/* Hero */}
            <section className="relative isolate overflow-hidden bg-linear-to-b from-white via-brand-tint/70 to-white">
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-full dot-field"
                />
                <div
                    className={cn(
                        wrap,
                        'flex flex-wrap items-center gap-14 pt-16 pb-20 sm:pt-[88px] sm:pb-[104px]',
                    )}
                >
                    <div className="flex min-w-0 flex-[1_1_460px] animate-rise flex-col items-start gap-6">
                        <span className="inline-flex items-center gap-2 rounded-full border border-brand-line bg-white px-3.5 py-1.5 text-label font-semibold text-brand-hover shadow-xs">
                            <CircleCheck
                                aria-hidden="true"
                                className="size-3.5"
                                strokeWidth={2.2}
                            />
                            {t('landing.hero.badge')}
                        </span>
                        <h1 className="text-hero font-bold text-balance text-ink ltr:tracking-[-0.03em] rtl:tracking-normal">
                            {t('landing.hero.title')}
                        </h1>
                        <p className="max-w-[540px] text-[1.25rem] leading-[1.6] text-pretty text-ink-soft">
                            {t('landing.hero.sub')}
                        </p>
                        <div className="flex flex-wrap gap-3">
                            <Button
                                size="lg"
                                className={cn(marketingPrimary, 'px-8')}
                                asChild
                            >
                                <Link href="/register">
                                    {t('landing.hero.ctaStart')}
                                </Link>
                            </Button>
                            <Button
                                size="lg"
                                variant="outline"
                                className={cn(marketingSecondary, 'px-8')}
                                onClick={() => setDialog('request')}
                            >
                                {t('landing.hero.ctaDemo')}
                            </Button>
                        </div>
                        <p className="text-label text-subtle">
                            {t('landing.hero.note')}
                        </p>
                    </div>

                    <div
                        className="flex max-w-[560px] min-w-0 flex-[1_1_460px] animate-rise flex-col gap-3.5"
                        style={{ animationDelay: '140ms' }}
                    >
                        <div className="animate-float">
                            <HeroDemo />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2.5">
                            <button
                                type="button"
                                onClick={() => setDialog('watch')}
                                className="group inline-flex min-h-12 items-center gap-2.5 rounded-full border border-line bg-white py-0 ps-3.5 pe-5 text-control font-semibold text-ink shadow-soft transition-[box-shadow,transform] hover:shadow-float"
                            >
                                <span
                                    aria-hidden="true"
                                    className="inline-flex size-7 items-center justify-center rounded-full bg-brand text-white transition-transform duration-300 group-hover:scale-110"
                                >
                                    <Play className="size-3 fill-current" />
                                </span>
                                {t('landing.mock.demo')}
                            </button>
                            <span className="text-small text-subtle">
                                {t('landing.mock.sample')}
                            </span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Benefits */}
            <Section id="benefits">
                <div
                    className={cn(
                        wrap,
                        'flex flex-col gap-12 py-16 sm:py-[104px]',
                    )}
                >
                    <SectionHead
                        title={t('landing.benefits.title')}
                        sub={t('landing.benefits.sub')}
                    />
                    <div className={GRID_320}>
                        {benefits.map(({ key, icon }, index) => (
                            <Reveal
                                key={key}
                                delay={index * 70}
                                className="flex"
                            >
                                <div
                                    className={cn(
                                        card,
                                        'flex w-full flex-col gap-3.5 p-7',
                                    )}
                                >
                                    <IconTile icon={icon} size="lg" />
                                    <h3 className="text-[1.3125rem] leading-[1.3] font-bold text-ink">
                                        {t(`landing.benefits.${key}.title`)}
                                    </h3>
                                    <p>{t(`landing.benefits.${key}.text`)}</p>
                                </div>
                            </Reveal>
                        ))}
                    </div>
                </div>
            </Section>

            {/* How it works */}
            <Section id="how" subtle>
                <div
                    className={cn(
                        wrap,
                        'flex flex-col gap-12 py-16 sm:py-[104px]',
                    )}
                >
                    <SectionHead
                        title={t('landing.how.title')}
                        sub={t('landing.how.sub')}
                    />
                    <div className={GRID_320}>
                        {steps.map((key, index) => (
                            <Reveal
                                key={key}
                                delay={index * 70}
                                className="flex"
                            >
                                <div
                                    className={cn(
                                        card,
                                        'flex w-full flex-col gap-3.5 p-7',
                                    )}
                                >
                                    <span
                                        aria-hidden="true"
                                        lang="en"
                                        className="inline-flex size-10 items-center justify-center rounded-full bg-brand font-sans text-lead font-bold text-white transition-transform duration-300 group-hover:scale-110"
                                    >
                                        {index + 1}
                                    </span>
                                    <h3 className="text-[1.3125rem] leading-[1.3] font-bold text-ink">
                                        {t(`landing.how.${key}.title`)}
                                    </h3>
                                    <p>{t(`landing.how.${key}.text`)}</p>
                                </div>
                            </Reveal>
                        ))}
                    </div>
                </div>
            </Section>

            {/* Statuses */}
            <Section>
                <div
                    className={cn(
                        wrap,
                        'flex flex-col gap-10 py-16 sm:py-[104px]',
                    )}
                >
                    <SectionHead
                        title={t('landing.statuses.title')}
                        sub={t('landing.statuses.sub')}
                    />
                    <ul className="grid [grid-template-columns:repeat(auto-fit,minmax(min(250px,100%),1fr))] gap-4">
                        {APPOINTMENT_STATUSES.map((status, index) => (
                            <Reveal
                                as="li"
                                key={status}
                                delay={index * 50}
                                className="flex"
                            >
                                <div className="flex w-full flex-col items-start gap-2.5 rounded-2xl border border-line/70 bg-white px-5 py-[18px] shadow-soft transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-brand-line hover:shadow-float motion-reduce:hover:translate-y-0">
                                    <StatusBadge
                                        status={status}
                                        className="px-3 py-1.5 text-label"
                                    />
                                    <span className="text-control">
                                        {t(`landing.statuses.${status}`)}
                                    </span>
                                </div>
                            </Reveal>
                        ))}
                    </ul>
                </div>
            </Section>

            {/* Patient link */}
            <Section subtle>
                <div
                    className={cn(
                        wrap,
                        'flex flex-wrap items-center gap-14 py-16 sm:py-[104px]',
                    )}
                >
                    <Reveal className="flex min-w-0 flex-[1_1_440px] flex-col gap-5">
                        <h2 className="text-section font-bold text-balance text-ink ltr:tracking-[-0.02em] rtl:tracking-normal">
                            {t('landing.patient.title')}
                        </h2>
                        <p className="text-lead text-pretty">
                            {t('landing.patient.text')}
                        </p>
                        <ul className="flex flex-col gap-3">
                            {(['p1', 'p2', 'p3'] as const).map((key) => (
                                <li
                                    key={key}
                                    className="flex items-start gap-3"
                                >
                                    <CircleCheck
                                        aria-hidden="true"
                                        className="mt-[3px] size-[22px] shrink-0 text-brand"
                                        strokeWidth={2.2}
                                    />
                                    <span className="font-medium text-ink">
                                        {t(`landing.patient.${key}`)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </Reveal>

                    <Reveal
                        delay={120}
                        className="flex min-w-0 flex-[1_1_360px] flex-col items-center gap-3"
                    >
                        <PhoneMock />
                        <span className="text-small text-subtle">
                            {t('landing.mock.sample')}
                        </span>
                    </Reveal>
                </div>
            </Section>

            {/* Roles */}
            <Section>
                <div
                    className={cn(
                        wrap,
                        'flex flex-col gap-12 py-16 sm:py-[104px]',
                    )}
                >
                    <SectionHead
                        title={t('landing.roles.title')}
                        sub={t('landing.roles.sub')}
                    />
                    <div className={GRID_250}>
                        {roles.map(({ key, icon }, index) => (
                            <Reveal
                                key={key}
                                delay={index * 70}
                                className="flex"
                            >
                                <div
                                    className={cn(
                                        card,
                                        'flex w-full flex-col gap-3 p-6',
                                    )}
                                >
                                    <IconTile icon={icon} />
                                    <h3 className="text-[1.1875rem] leading-[1.3] font-bold text-ink">
                                        {t(`landing.roles.${key}.title`)}
                                    </h3>
                                    <p className="text-control">
                                        {t(`landing.roles.${key}.text`)}
                                    </p>
                                </div>
                            </Reveal>
                        ))}
                    </div>
                </div>
            </Section>

            {/* Trust */}
            <Section subtle>
                <div
                    className={cn(
                        wrap,
                        'flex flex-col gap-12 py-16 sm:py-[104px]',
                    )}
                >
                    <SectionHead
                        title={t('landing.trust.title')}
                        sub={t('landing.trust.sub')}
                    />
                    <div className={GRID_320}>
                        {trust.map(({ key, icon }, index) => (
                            <Reveal
                                key={key}
                                delay={index * 70}
                                className="flex"
                            >
                                <div
                                    className={cn(
                                        card,
                                        'flex w-full flex-col gap-3 p-7',
                                    )}
                                >
                                    <IconTile icon={icon} />
                                    <h3 className="text-[1.1875rem] leading-[1.3] font-bold text-ink">
                                        {t(`landing.trust.${key}.title`)}
                                    </h3>
                                    <p className="text-control">
                                        {t(`landing.trust.${key}.text`)}
                                    </p>
                                </div>
                            </Reveal>
                        ))}
                    </div>
                    <Reveal>
                        <Link
                            href="/privacy"
                            className="inline-flex min-h-11 items-center rounded-md text-body font-semibold text-brand-hover underline-offset-4 transition-colors hover:text-brand-deep hover:underline"
                        >
                            {t('landing.trust.link')}
                        </Link>
                    </Reveal>
                </div>
            </Section>

            {/* Plans */}
            <Section id="plans">
                <div
                    className={cn(
                        wrap,
                        'flex flex-col gap-12 py-16 sm:py-[104px]',
                    )}
                >
                    <SectionHead
                        title={t('landing.plans.title')}
                        sub={
                            <Placeholders>
                                {t('landing.plans.sub')}
                            </Placeholders>
                        }
                    />
                    <div className={GRID_320}>
                        {[0, 1, 2].map((index) => (
                            <Reveal
                                key={index}
                                delay={index * 70}
                                className="flex"
                            >
                                <div className="flex w-full flex-col items-start gap-3.5 rounded-[20px] border border-dashed border-line-dashed p-7 transition-colors duration-300 hover:border-brand-line hover:bg-brand-tint/40">
                                    <h3 className="text-[1.3125rem] leading-[1.3] font-bold text-ink">
                                        <Placeholders>
                                            {t('landing.plans.name')}
                                        </Placeholders>
                                    </h3>
                                    <p className="text-control">
                                        <Placeholders>
                                            {t('landing.plans.for')}
                                        </Placeholders>
                                    </p>
                                    <p className="text-control">
                                        <Placeholders>
                                            {t('landing.plans.incl')}
                                        </Placeholders>
                                    </p>
                                    <Button
                                        variant="outline"
                                        className={marketingSecondary}
                                        onClick={() => setDialog('request')}
                                    >
                                        {t('landing.hero.ctaDemo')}
                                    </Button>
                                </div>
                            </Reveal>
                        ))}
                    </div>
                </div>
            </Section>

            {/* FAQ */}
            <Section id="faq" subtle>
                <div className="mx-auto flex w-full max-w-[820px] flex-col gap-8 px-6 py-16 sm:py-[104px]">
                    <Reveal>
                        <h2 className="text-section font-bold text-ink ltr:tracking-[-0.02em] rtl:tracking-normal">
                            {t('landing.faq.title')}
                        </h2>
                    </Reveal>
                    <Reveal delay={80}>
                        <FaqAccordion items={faq} />
                    </Reveal>
                </div>
            </Section>

            {/* Closing call to action */}
            <Section id="cta">
                <div className={cn(wrap, 'py-16 sm:py-[104px]')}>
                    <Reveal>
                        <div className="flex flex-col items-center gap-5 rounded-[28px] bg-navy px-8 py-16 text-center text-white">
                            <h2 className="max-w-[640px] text-section font-bold text-balance text-white">
                                {t('landing.cta.title')}
                            </h2>
                            <p className="max-w-[560px] text-lead text-navy-ink">
                                {t('landing.cta.text')}
                            </p>
                            <div className="flex flex-wrap justify-center gap-3">
                                <Button
                                    size="lg"
                                    className={cn(marketingOnNavy, 'px-8')}
                                    asChild
                                >
                                    <Link href="/register">
                                        {t('landing.hero.ctaStart')}
                                    </Link>
                                </Button>
                                <Button
                                    size="lg"
                                    variant="ghost"
                                    className="rounded-full border border-navy-line px-8 text-white hover:bg-white/10 hover:text-white"
                                    onClick={() => setDialog('request')}
                                >
                                    {t('landing.hero.ctaDemo')}
                                </Button>
                            </div>
                        </div>
                    </Reveal>
                </div>
            </Section>

            <WatchDemoDialog
                open={dialog === 'watch'}
                onOpenChange={(open) => setDialog(open ? 'watch' : null)}
            />
            <RequestDemoDialog
                open={dialog === 'request'}
                onOpenChange={(open) => setDialog(open ? 'request' : null)}
            />
        </PublicLayout>
    );
}

/** The patient's page as it looks on a phone. Sample content, labelled where it is used. */
function PhoneMock() {
    const { t } = useT();

    return (
        <div className="w-full max-w-[340px] rounded-[36px] border border-line-strong bg-white p-3.5 shadow-lift transition-transform duration-500 ease-out-soft hover:-translate-y-1">
            <div className="flex flex-col gap-4 rounded-3xl bg-surface-subtle px-[18px] py-[22px]">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-body font-bold text-ink">
                        {t('shell.clinicName')}
                    </span>
                    <span className="inline-flex rounded-sm border border-line bg-white p-0.5 text-caption font-semibold">
                        <span className="rounded-xs bg-brand px-2 py-1 text-white">
                            EN
                        </span>
                        <span className="px-2 py-1 text-copy">اردو</span>
                    </span>
                </div>
                <div className="flex flex-col gap-1">
                    <span className="text-small font-medium text-subtle">
                        {t('landing.patient.yours')}
                    </span>
                    <StatusBadge status="booked" className="self-start" />
                </div>
                <dl className="flex flex-col rounded-lg border border-line bg-white px-3.5 py-1.5">
                    {[
                        [t('landing.mock.doctor'), t('landing.mock.vDoctor')],
                        [t('landing.mock.service'), t('landing.mock.vService')],
                        [t('landing.patient.when'), t('landing.mock.vWhen')],
                    ].map(([label, value], index, all) => (
                        <div
                            key={label}
                            className={cn(
                                'flex justify-between gap-3 py-2.5',
                                index < all.length - 1 &&
                                    'border-b border-line-soft',
                            )}
                        >
                            <dt className="text-label text-subtle">{label}</dt>
                            <dd className="text-label font-semibold text-ink">
                                {value}
                            </dd>
                        </div>
                    ))}
                </dl>
                <div className="flex items-center gap-2 text-label">
                    <MapPin
                        aria-hidden="true"
                        className="size-4 shrink-0 text-copy"
                    />
                    <span>
                        <Placeholders>
                            {t('landing.patient.address')}
                        </Placeholders>
                    </span>
                    <span className="ms-auto font-semibold text-brand-hover">
                        {t('landing.patient.map')}
                    </span>
                </div>
                <div className="flex flex-col gap-2.5">
                    <span className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-brand text-control font-semibold text-white">
                        <Check
                            aria-hidden="true"
                            className="size-4"
                            strokeWidth={2.6}
                        />
                        {t('landing.patient.confirm')}
                    </span>
                    <span className="inline-flex min-h-12 items-center justify-center rounded-md border border-line-strong bg-white text-control font-semibold text-ink">
                        {t('landing.patient.reschedule')}
                    </span>
                    <span className="inline-flex min-h-12 items-center justify-center rounded-md text-control font-semibold text-danger-ink">
                        {t('landing.patient.cancel')}
                    </span>
                </div>
            </div>
        </div>
    );
}

function LandingFooter({ onRequest }: { onRequest: () => void }) {
    const { t } = useT();
    const link =
        'inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-1 text-control font-medium text-brand-hover transition-colors hover:text-brand-deep hover:underline';

    return (
        <footer className="border-t border-line bg-white">
            <div
                className={cn(
                    wrap,
                    'flex flex-wrap justify-between gap-6 py-10',
                )}
            >
                <div className="flex max-w-[360px] flex-col gap-2">
                    <Wordmark />
                    <span className="text-control">
                        {t('landing.footer.tag')}
                    </span>
                    <span className="text-label text-subtle">
                        <Placeholders>
                            {t('landing.footer.contact')}
                        </Placeholders>
                    </span>
                </div>
                <nav
                    aria-label="Footer"
                    className="flex flex-wrap items-start gap-x-5 gap-y-1"
                >
                    <Link href="/privacy" className={link}>
                        {t('landing.footer.privacy')}
                    </Link>
                    <Link href="/login" className={link}>
                        {t('auth.common.logIn')}
                    </Link>
                    <button type="button" onClick={onRequest} className={link}>
                        {t('landing.hero.ctaDemo')}
                    </button>
                </nav>
            </div>
        </footer>
    );
}
