import type { Locale } from '@/i18n/locales';
import type { AppointmentStatus } from '@/lib/data';

/**
 * Text that only exists to demonstrate components. It lives here, not in the app's message
 * files, so it never ships as real UI copy. All of it is sample content.
 */
export type PreviewCopy = {
    dialog: { title: string; body: string; confirm: string; keep: string };
    toast: { success: string; error: string; warning: string; info: string };
    empty: { title: string; body: string; action: string };
    form: {
        name: string;
        nameHint: string;
        nameError: string;
        email: string;
        emailHint: string;
        notes: string;
        doctor: string;
        choose: string;
        remember: string;
        disabled: string;
        reason: string;
        reasonSample: string;
        viaPhone: string;
        viaWhatsapp: string;
        channel: string;
    };
    table: {
        title: string;
        search: string;
        date: string;
        doctor: string;
        status: string;
        all: string;
        anyDate: string;
        today: string;
        when: string;
        patient: string;
        doctorCol: string;
        statusCol: string;
        actions: string;
        view: string;
        reschedule: string;
        cancel: string;
        more: string;
    };
    rows: {
        id: string;
        day: string;
        time: string;
        patient: string;
        phone: string;
        doctor: string;
        status: AppointmentStatus;
    }[];
};

const DOCTOR = {
    en: ['Dr. Rahman', 'Dr. Khan'],
    ur: ['ڈاکٹر رحمان', 'ڈاکٹر خان'],
};

const row = (
    locale: Locale,
    n: number,
    day: { en: string; ur: string },
    time: string,
    patient: { en: string; ur: string },
    phone: string,
    doc: 0 | 1,
    status: AppointmentStatus,
) => ({
    id: String(n),
    day: day[locale],
    time,
    patient: patient[locale],
    phone,
    doctor: DOCTOR[locale][doc],
    status,
});

const TODAY = { en: 'Today', ur: 'آج' };
const TOMORROW = { en: 'Tomorrow', ur: 'کل' };

const rowsFor = (locale: Locale) => [
    row(
        locale,
        1,
        TODAY,
        '09:30',
        { en: 'Sadia Noor', ur: 'سعدیہ نور' },
        '0300 5550101',
        0,
        'in_consultation',
    ),
    row(
        locale,
        2,
        TODAY,
        '10:00',
        { en: 'Omar Farooq', ur: 'عمر فاروق' },
        '0321 7654321',
        0,
        'arrived',
    ),
    row(
        locale,
        3,
        TODAY,
        '10:30',
        { en: 'Zainab Hussain', ur: 'زینب حسین' },
        '0333 1112233',
        0,
        'confirmed',
    ),
    row(
        locale,
        4,
        TODAY,
        '11:00',
        { en: 'Faisal Mehmood', ur: 'فیصل محمود' },
        '0345 5550104',
        1,
        'booked',
    ),
    row(
        locale,
        5,
        TOMORROW,
        '09:00',
        { en: 'Asma Raza', ur: 'اسماء رضا' },
        '0300 1234567',
        0,
        'booked',
    ),
    row(
        locale,
        6,
        TOMORROW,
        '14:00',
        { en: 'Nida Kamal', ur: 'ندا کمال' },
        '0301 5550107',
        1,
        'cancelled',
    ),
    row(
        locale,
        7,
        TODAY,
        '15:30',
        { en: 'Bashir Ahmed', ur: 'بشیر احمد' },
        '0302 5550108',
        1,
        'no_show',
    ),
    row(
        locale,
        8,
        TODAY,
        '16:00',
        { en: 'Maryam Aslam', ur: 'مریم اسلم' },
        '0304 5550110',
        1,
        'done',
    ),
];

export const COPY: Record<Locale, PreviewCopy> = {
    en: {
        dialog: {
            title: 'Cancel [Patient name]’s appointment?',
            body: 'The patient will be told by message and the time becomes free for others.',
            confirm: 'Yes, cancel it',
            keep: 'Keep appointment',
        },
        toast: {
            success: 'Appointment cancelled.',
            error: 'Could not save. Try again.',
            warning: 'That time is held by another user.',
            info: 'A confirmation message was queued.',
        },
        empty: {
            title: 'No notifications yet',
            body: 'Messages show up here once confirmations and reminders are sent.',
            action: 'Go to Today',
        },
        form: {
            name: 'Full name',
            nameHint: 'As the patient says it on the phone.',
            nameError: 'Enter the patient’s name.',
            email: 'Email',
            emailHint: 'Used for sign-in and password resets.',
            notes: 'Notes (non-clinical)',
            doctor: 'Doctor',
            choose: 'Choose a doctor',
            remember: 'Remember me on this computer',
            disabled: 'Locked field',
            reason: 'Visit reason',
            reasonSample: 'Sample text typed into the field',
            viaPhone: 'SMS',
            viaWhatsapp: 'WhatsApp',
            channel: 'Message channel',
        },
        table: {
            title: 'Appointments',
            search: 'Search by patient name or phone',
            date: 'Date',
            doctor: 'Doctor',
            status: 'Status',
            all: 'All',
            anyDate: 'Any date',
            today: 'Today',
            when: 'When',
            patient: 'Patient',
            doctorCol: 'Doctor',
            statusCol: 'Status',
            actions: 'Actions',
            view: 'View',
            reschedule: 'Reschedule',
            cancel: 'Cancel',
            more: 'More',
        },
        rows: rowsFor('en'),
    },
    ur: {
        dialog: {
            title: '[مریض کا نام] کی اپائنٹمنٹ منسوخ کریں؟',
            body: 'مریض کو پیغام سے اطلاع دی جائے گی اور وقت دوسروں کے لیے خالی ہو جائے گا۔',
            confirm: 'جی، منسوخ کریں',
            keep: 'اپائنٹمنٹ رکھیں',
        },
        toast: {
            success: 'اپائنٹمنٹ منسوخ ہو گئی۔',
            error: 'محفوظ نہیں ہو سکا۔ دوبارہ کوشش کریں۔',
            warning: 'یہ وقت کسی دوسرے صارف نے روکا ہوا ہے۔',
            info: 'تصدیقی پیغام قطار میں لگا دیا گیا۔',
        },
        empty: {
            title: 'ابھی کوئی اطلاع نہیں',
            body: 'تصدیق اور یاد دہانی کے پیغام بھیجے جانے پر یہاں نظر آئیں گے۔',
            action: 'آج پر جائیں',
        },
        form: {
            name: 'پورا نام',
            nameHint: 'جیسا مریض فون پر بتائے۔',
            nameError: 'مریض کا نام درج کریں۔',
            email: 'ای میل',
            emailHint: 'سائن اِن اور پاس ورڈ ری سیٹ کے لیے۔',
            notes: 'نوٹس (غیر طبی)',
            doctor: 'ڈاکٹر',
            choose: 'ڈاکٹر چنیں',
            remember: 'اس کمپیوٹر پر مجھے یاد رکھیں',
            disabled: 'بند فیلڈ',
            reason: 'آنے کی وجہ',
            reasonSample: 'فیلڈ میں لکھا گیا نمونہ متن',
            viaPhone: 'ایس ایم ایس',
            viaWhatsapp: 'واٹس ایپ',
            channel: 'پیغام کا ذریعہ',
        },
        table: {
            title: 'اپائنٹمنٹس',
            search: 'مریض کے نام یا فون سے تلاش کریں',
            date: 'تاریخ',
            doctor: 'ڈاکٹر',
            status: 'حالت',
            all: 'سب',
            anyDate: 'کوئی بھی تاریخ',
            today: 'آج',
            when: 'کب',
            patient: 'مریض',
            doctorCol: 'ڈاکٹر',
            statusCol: 'حالت',
            actions: 'اقدامات',
            view: 'دیکھیں',
            reschedule: 'وقت بدلیں',
            cancel: 'منسوخ کریں',
            more: 'مزید',
        },
        rows: rowsFor('ur'),
    },
};
