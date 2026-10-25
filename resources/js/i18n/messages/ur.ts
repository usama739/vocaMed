import type en from './en';

type DeepString<T> = {
    -readonly [K in keyof T]: T[K] extends string ? string : DeepString<T[K]>;
};

/** Must mirror the keys of `en`; the type makes a missing translation a compile error. */
const ur: DeepString<typeof en> = {
    common: {
        appName: 'ووکامیڈ',
        language: 'زبان',
        retry: 'دوبارہ کوشش کریں',
        confirm: 'تصدیق کریں',
        cancel: 'منسوخ کریں',
        save: 'محفوظ کریں',
        search: 'تلاش کریں',
        loading: 'لوڈ ہو رہا ہے…',
    },
    roles: {
        clinic_admin: 'کلینک ایڈمن',
        receptionist: 'ریسیپشنسٹ',
        doctor: 'ڈاکٹر',
        patient: 'مریض',
    },
    status: {
        booked: 'بک شدہ',
        confirmed: 'تصدیق شدہ',
        arrived: 'پہنچ گئے',
        in_consultation: 'معائنہ جاری',
        done: 'مکمل',
        cancelled: 'منسوخ',
        no_show: 'غیر حاضر',
    },
    channel: {
        sms: 'ایس ایم ایس',
        whatsapp: 'واٹس ایپ',
    },
    notificationStatus: {
        queued: 'قطار میں',
        sent: 'بھیجا گیا',
        delivered: 'موصول ہوا',
        failed: 'ناکام',
    },
};

export default ur;
