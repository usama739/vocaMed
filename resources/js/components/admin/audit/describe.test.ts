import i18n from 'i18next';
import { describe, expect, it } from 'vitest';
import type { Locale } from '@/i18n/locales';
import type { AuditRow } from '@/lib/data';
import '@/test/render';
import { describeAudit, type Translate } from './describe';

const TZ = 'Asia/Karachi';

const say = (
    row: Partial<AuditRow> & Pick<AuditRow, 'action'>,
    locale: Locale,
) =>
    describeAudit(
        {
            id: 'au_1',
            at: '2026-10-26T05:00:00.000Z',
            actor: { kind: 'user', name: 'Ayesha Khan' },
            category: 'edit',
            meta: {},
            ...row,
        },
        { t: i18n.getFixedT(locale) as unknown as Translate, tz: TZ, locale },
    );

const visit = {
    patientName: 'Maryam Aslam',
    doctorName: 'Dr. Sana Malik',
    startsAt: '2026-10-26T06:30:00.000Z',
};

describe('describeAudit', () => {
    it('names the patient, doctor, time and how the booking was made', () => {
        const text = say(
            {
                action: 'appointment.created',
                meta: { source: 'voice' },
                appointment: visit,
            },
            'en',
        );

        expect(text).toContain('Maryam Aslam, Dr. Sana Malik');
        expect(text).toContain('11:30');
        expect(text).toMatch(/\(voice\)$/);
    });

    it('leaves a manual booking without a suffix', () => {
        expect(
            say(
                {
                    action: 'appointment.created',
                    meta: { source: 'manual' },
                    appointment: visit,
                },
                'en',
            ),
        ).not.toContain('(');
    });

    it('reads the same entry in Urdu', () => {
        const text = say(
            {
                action: 'appointment.status_changed',
                meta: { status: 'arrived', from: 'confirmed' },
                appointment: visit,
            },
            'ur',
        );

        expect(text).toContain('Maryam Aslam');
        expect(text).toContain('حالت');
        expect(text).not.toContain('status changed');
    });

    it('describes a move with both times', () => {
        const text = say(
            {
                action: 'appointment.rescheduled',
                meta: {
                    from: '2026-10-26T06:30:00.000Z',
                    to: '2026-10-27T08:00:00.000Z',
                },
                appointment: visit,
            },
            'en',
        );

        expect(text).toContain('11:30');
        expect(text).toContain('13:00');
    });

    it('lists the settings sections that changed', () => {
        expect(
            say(
                {
                    action: 'settings.updated',
                    meta: { section: 'hours,voice' },
                },
                'en',
            ),
        ).toBe('Settings changed: business hours, voice booking');
        expect(say({ action: 'settings.updated', meta: {} }, 'en')).toBe(
            'Settings changed',
        );
    });

    it('describes invitations with the address and role', () => {
        expect(
            say(
                {
                    action: 'user.invited',
                    meta: {
                        email: 'newdesk@shifa.example',
                        role: 'receptionist',
                    },
                },
                'en',
            ),
        ).toBe('Invitation sent to newdesk@shifa.example (receptionist)');
    });

    it('describes a template edit in the page language', () => {
        expect(
            say(
                {
                    action: 'template.updated',
                    meta: { kind: 'reminder', channel: 'sms', locale: 'ur' },
                },
                'en',
            ),
        ).toBe('The reminder message (SMS, Urdu) was edited');
    });

    it('knows a new device sign-in', () => {
        expect(
            say({ action: 'auth.login', meta: { newDevice: true } }, 'en'),
        ).toBe('Signed in from a new device');
    });

    it('falls back to the action code when it has nothing to say', () => {
        expect(say({ action: 'something.new' }, 'en')).toBe('something.new');
        // An appointment entry whose appointment is gone is shown as its code too.
        expect(say({ action: 'appointment.cancelled' }, 'en')).toBe(
            'appointment.cancelled',
        );
    });
});
