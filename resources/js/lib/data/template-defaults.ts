import type { Locale, NotificationKind } from './types';

/**
 * The wording every clinic starts with. On the server this is a seeded table or a config file; a
 * clinic only stores a message once it edits it.
 */
export const DEFAULT_TEMPLATE_BODIES: Record<
    NotificationKind,
    Record<Locale, string>
> = {
    confirmation: {
        en: 'Hi {patient_name}, your appointment with {doctor} is booked for {time} at {clinic_name}. Confirm, reschedule or cancel here: {link}',
        ur: 'السلام علیکم {patient_name}، {clinic_name} میں {doctor} کے ساتھ آپ کی اپائنٹمنٹ {time} پر بُک ہو گئی ہے۔ تصدیق، وقت کی تبدیلی یا منسوخی یہاں سے کریں: {link}',
    },
    reminder: {
        en: 'Reminder: {patient_name}, you have an appointment with {doctor} at {time}. Confirm or change it here: {link}',
        ur: 'یاد دہانی: {patient_name}، {doctor} کے ساتھ آپ کی اپائنٹمنٹ {time} پر ہے۔ تصدیق یا تبدیلی یہاں سے کریں: {link}',
    },
    reschedule: {
        en: 'Hi {patient_name}, your appointment with {doctor} has moved to {time}. Details: {link}',
        ur: 'السلام علیکم {patient_name}، {doctor} کے ساتھ آپ کی اپائنٹمنٹ اب {time} پر ہے۔ تفصیل: {link}',
    },
    cancellation: {
        en: 'Hi {patient_name}, your appointment with {doctor} at {time} has been cancelled. To book again, please call {clinic_name}.',
        ur: 'السلام علیکم {patient_name}، {time} پر {doctor} کے ساتھ آپ کی اپائنٹمنٹ منسوخ کر دی گئی ہے۔ دوبارہ بُک کرنے کے لیے {clinic_name} کو کال کریں۔',
    },
};

/** Example values the preview fills in, per message language. */
export const TEMPLATE_SAMPLE: Record<Locale, Record<string, string>> = {
    en: {
        patient_name: 'Ayesha Khan',
        doctor: 'Dr. Rahman',
        time: 'Tomorrow, 4:00 PM',
        clinic_name: 'Your clinic',
        link: 'vocamed.link/p/…',
    },
    ur: {
        patient_name: 'عائشہ خان',
        doctor: 'ڈاکٹر رحمان',
        time: 'کل، شام 4:00 بجے',
        clinic_name: 'آپ کا کلینک',
        link: 'vocamed.link/p/…',
    },
};
