import { formatWhen } from '@/components/vocamed/booking/format';
import type { Locale } from '@/i18n/locales';
import type { AuditRow } from '@/lib/data';

export type Translate = (
    key: string,
    options?: Record<string, unknown>,
) => string;

const SOURCES = ['voice', 'walk_in', 'patient_link'];

const text = (value: unknown): string =>
    typeof value === 'string' ? value : '';

/**
 * One sentence for an audit entry, in the page language. The server stores structured data (an
 * action code and a few values, with the patient and doctor joined for appointments), never
 * English text, so the same entry reads correctly in English and Urdu. An action this page does
 * not know yet shows as its raw code instead of nothing.
 */
export function describeAudit(
    row: AuditRow,
    ctx: { t: Translate; tz: string; locale: Locale },
): string {
    const { t, tz, locale } = ctx;
    const meta = row.meta;
    const appointment = row.appointment;
    const at = (iso: string) => formatWhen(iso, tz, locale);
    const status = (value: unknown) =>
        text(value) ? t(`status.${text(value)}`) : '';
    const label = (group: string, value: unknown) =>
        text(value) ? t(`admin.audit.${group}.${text(value)}`) : '';
    const people = appointment
        ? {
              patient: appointment.patientName,
              doctor: appointment.doctorName,
          }
        : null;
    const email = text(meta.email);

    switch (row.action) {
        case 'appointment.created':
            return appointment && people
                ? t('admin.audit.details.visit', {
                      ...people,
                      when: at(appointment.startsAt),
                      // A manual booking is the usual case and needs no note.
                      source: SOURCES.includes(text(meta.source))
                          ? label('sources', meta.source)
                          : '',
                  })
                : row.action;
        case 'appointment.status_changed':
            return people
                ? text(meta.from)
                    ? t('admin.audit.details.statusChanged', {
                          ...people,
                          from: status(meta.from),
                          status: status(meta.status),
                      })
                    : t('admin.audit.details.statusSet', {
                          ...people,
                          status: status(meta.status),
                      })
                : row.action;
        case 'appointment.status_reverted':
            return people
                ? t('admin.audit.details.statusReverted', {
                      ...people,
                      from: status(meta.from),
                      status: status(meta.status),
                  })
                : row.action;
        case 'appointment.rescheduled':
            return people && text(meta.from) && text(meta.to)
                ? t('admin.audit.details.rescheduled', {
                      ...people,
                      from: at(text(meta.from)),
                      to: at(text(meta.to)),
                  })
                : row.action;
        case 'appointment.cancelled':
            return appointment && people
                ? t('admin.audit.details.cancelled', {
                      ...people,
                      when: at(appointment.startsAt),
                  })
                : row.action;
        case 'appointment.message_resent':
            return people
                ? t('admin.audit.details.messageResent', {
                      patient: people.patient,
                      kind: label('kinds', meta.kind),
                  })
                : row.action;
        case 'request.decided':
            return people
                ? t('admin.audit.details.requestDecided', {
                      ...people,
                      decision: label('decisions', meta.decision),
                  })
                : row.action;
        case 'patient.created':
            return t('admin.audit.details.patientCreated');
        case 'patient.updated':
            return t('admin.audit.details.patientUpdated');
        case 'notification.resent':
            return t('admin.audit.details.notificationResent');
        case 'availability.updated':
            return t('admin.audit.details.availability');
        case 'auth.login':
            return meta.newDevice
                ? t('admin.audit.details.loginNewDevice')
                : t('admin.audit.details.login');
        case 'settings.updated': {
            const sections = text(meta.section)
                .split(',')
                .filter(Boolean)
                .map((name) =>
                    t(`admin.audit.sections.${name}`) ===
                    `admin.audit.sections.${name}`
                        ? name
                        : t(`admin.audit.sections.${name}`),
                );

            return sections.length > 0
                ? t('admin.audit.details.settings', {
                      sections: sections.join(locale === 'ur' ? '، ' : ', '),
                  })
                : t('admin.audit.details.settingsPlain');
        }
        case 'template.updated':
        case 'template.reset':
            return t(
                row.action === 'template.updated'
                    ? 'admin.audit.details.templateUpdated'
                    : 'admin.audit.details.templateReset',
                {
                    kind: label('kinds', meta.kind),
                    channel: label('channels', meta.channel),
                    language: text(meta.locale)
                        ? t(`reception.langName.${text(meta.locale)}`)
                        : '',
                },
            );
        case 'service.created':
            return t('admin.audit.details.serviceCreated');
        case 'service.updated':
            return t('admin.audit.details.serviceUpdated');
        case 'service.activated':
            return t('admin.audit.details.serviceActivated');
        case 'service.deactivated':
            return t('admin.audit.details.serviceDeactivated');
        case 'doctor.created':
            return t('admin.audit.details.doctorCreated');
        case 'doctor.updated':
            return t('admin.audit.details.doctorUpdated');
        case 'doctor.activated':
            return t('admin.audit.details.doctorActivated');
        case 'doctor.deactivated':
            return t('admin.audit.details.doctorDeactivated');
        case 'user.invited':
            return t('admin.audit.details.invited', {
                email,
                role: label('roles', meta.role) || text(meta.role),
            });
        case 'user.invitation_resent':
            return t('admin.audit.details.invitationResent', { email });
        case 'user.revoked':
            return t('admin.audit.details.revoked', { email });
        case 'user.deactivated':
            return t('admin.audit.details.userDeactivated', { email });
        case 'user.reactivated':
            return t('admin.audit.details.userReactivated', { email });
        default:
            return row.action;
    }
}
