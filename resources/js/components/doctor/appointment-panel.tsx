import {
    formatPhone,
    localDate,
    relativeDay,
} from '@/components/reception/format';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { formatClock } from '@/components/vocamed/booking/format';
import { StatusBadge } from '@/components/vocamed/status-badge';
import { useT } from '@/i18n/scope';
import type { AppointmentRow, Clinic, IsoDate } from '@/lib/data';

/**
 * The doctor's read-only view of one appointment: the same facts reception sees, nothing to edit.
 * It is a slide-over, so it traps focus, closes with Escape and gives focus back to the row.
 */
export function AppointmentPanel({
    row,
    clinic,
    today,
    open,
    onOpenChange,
}: {
    row: AppointmentRow | null;
    clinic: Clinic;
    today: IsoDate;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const { t, locale, dir } = useT();

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="right"
                dir={dir}
                lang={locale}
                aria-describedby={undefined}
                className="w-full gap-0 overflow-y-auto p-0 sm:max-w-[420px]"
            >
                <SheetHeader className="border-b border-line-soft p-6 pe-16">
                    <SheetTitle>{t('doctor.schedule.detail')}</SheetTitle>
                </SheetHeader>
                {row && (
                    <div className="flex flex-col gap-4 p-6">
                        <div>
                            <StatusBadge status={row.appointment.status} />
                        </div>
                        <dl className="grid grid-cols-[auto_1fr] gap-x-[18px] gap-y-2.5 text-control">
                            <dt className="text-subtle">
                                {t('doctor.schedule.fPatient')}
                            </dt>
                            <dd className="m-0 font-semibold text-ink">
                                {row.patient.name}
                            </dd>
                            <dt className="text-subtle">
                                {t('doctor.schedule.fPhone')}
                            </dt>
                            <dd className="m-0 font-semibold text-ink">
                                {row.patient.phone ? (
                                    <span dir="ltr" className="inline-block">
                                        {formatPhone(
                                            row.patient.phone,
                                            clinic.phoneCountryCode,
                                        )}
                                    </span>
                                ) : (
                                    t('reception.noPhone')
                                )}
                            </dd>
                            <dt className="text-subtle">
                                {t('doctor.schedule.fService')}
                            </dt>
                            <dd className="m-0 font-semibold text-ink">
                                {row.service.name}
                            </dd>
                            <dt className="text-subtle">
                                {t('doctor.schedule.fWhen')}
                            </dt>
                            <dd className="m-0 font-semibold text-ink">
                                {(() => {
                                    const { key, count } = relativeDay(
                                        localDate(
                                            row.appointment.startsAt,
                                            clinic.timezone,
                                        ),
                                        today,
                                    );

                                    return t(`reception.day.${key}`, { count });
                                })()}
                                {', '}
                                <span dir="ltr">
                                    {formatClock(
                                        row.appointment.startsAt,
                                        clinic.timezone,
                                    )}
                                </span>
                            </dd>
                            <dt className="text-subtle">
                                {t('doctor.schedule.fDoctor')}
                            </dt>
                            <dd className="m-0 font-semibold text-ink">
                                {row.doctor.name}
                            </dd>
                        </dl>
                        <p className="text-small text-subtle">
                            {t('doctor.schedule.readonlyNote')}
                        </p>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}
