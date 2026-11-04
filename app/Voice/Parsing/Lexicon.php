<?php

namespace App\Voice\Parsing;

/**
 * The words the rules parser knows, in English, Roman Urdu (Urdu written in Latin letters, spelled however people spell it) and Urdu
 * script. Every entry is already folded (lower case, Urdu digits and look-alike letters unified). Adding a way people say something is
 * one more entry here, plus a phrase in tests/fixtures/voice/phrases.json that proves it.
 */
final class Lexicon
{
    /** @var array<string, int> weekday words to 0 (Sunday) to 6 (Saturday) */
    public const WEEKDAYS = [
        'sunday' => 0, 'itwar' => 0, 'itwaar' => 0, 'ittwar' => 0, 'ittwaar' => 0, 'etwar' => 0, 'اتوار' => 0,
        'monday' => 1, 'mon' => 1, 'pir' => 1, 'peer' => 1, 'somwar' => 1, 'پیر' => 1,
        'tuesday' => 2, 'tue' => 2, 'tues' => 2, 'mangal' => 2, 'mangl' => 2, 'mangalwar' => 2, 'منگل' => 2,
        'wednesday' => 3, 'budh' => 3, 'budhwar' => 3, 'بدھ' => 3,
        'thursday' => 4, 'thu' => 4, 'thur' => 4, 'thurs' => 4, 'jumerat' => 4, 'jumeraat' => 4, 'jumaraat' => 4, 'jummerat' => 4, 'جمعرات' => 4,
        'friday' => 5, 'fri' => 5, 'juma' => 5, 'jumma' => 5, 'jumah' => 5, 'jumua' => 5, 'جمعہ' => 5, 'جمعے' => 5,
        'saturday' => 6, 'sanichar' => 6, 'sanivar' => 6, 'ہفتہ' => 6,
    ];

    /** @var array<string, int> */
    public const MONTHS = [
        'january' => 1, 'jan' => 1, 'february' => 2, 'feb' => 2, 'march' => 3, 'april' => 4, 'apr' => 4, 'may' => 5, 'june' => 6, 'jun' => 6,
        'july' => 7, 'jul' => 7, 'august' => 8, 'aug' => 8, 'september' => 9, 'sep' => 9, 'sept' => 9, 'october' => 10, 'oct' => 10,
        'november' => 11, 'nov' => 11, 'december' => 12, 'dec' => 12,
        // Roman Urdu spellings.
        'janwari' => 1, 'janvari' => 1, 'farwari' => 2, 'farvari' => 2, 'maarch' => 3, 'aprail' => 4, 'julai' => 7, 'agast' => 8, 'sitambar' => 9, 'situmbar' => 9,
        'aktoobar' => 10, 'aktubar' => 10, 'navambar' => 11, 'disambar' => 12, 'disember' => 12,
        // Urdu script.
        'جنوری' => 1, 'فروری' => 2, 'مارچ' => 3, 'اپریل' => 4, 'مئی' => 5, 'جون' => 6, 'جولائی' => 7, 'اگست' => 8, 'ستمبر' => 9, 'اکتوبر' => 10, 'نومبر' => 11, 'دسمبر' => 12,
    ];

    /** Words after a day number that make it a day of the month: "the 15th", "15 tareekh", "15 تاریخ". */
    public const ORDINALS = ['st', 'nd', 'rd', 'th', 'tareekh', 'tarikh', 'تاریخ'];

    /** Days from today. "kal" can mean yesterday too; a booking is always for the future, so it is tomorrow. */
    public const TODAY = ['today', 'aaj', 'aj', 'آج'];

    public const TOMORROW = ['tomorrow', 'tomorow', 'tmrw', 'tommorow', 'kal', 'کل'];

    public const DAY_AFTER = ['parson', 'parsoon', 'parso', 'parsun', 'پرسوں', 'پرسو'];

    /** @var array<string, int> hour words to 1 to 12 */
    public const NUMBERS = [
        'one' => 1, 'two' => 2, 'three' => 3, 'four' => 4, 'five' => 5, 'six' => 6, 'seven' => 7, 'eight' => 8, 'nine' => 9, 'ten' => 10, 'eleven' => 11, 'twelve' => 12,
        'ek' => 1, 'do' => 2, 'teen' => 3, 'char' => 4, 'chaar' => 4, 'panch' => 5, 'paanch' => 5, 'chhe' => 6, 'chhay' => 6, 'chay' => 6, 'che' => 6, 'chhah' => 6,
        'saat' => 7, 'sat' => 7, 'aath' => 8, 'ath' => 8, 'nau' => 9, 'das' => 10, 'gyarah' => 11, 'gyara' => 11, 'giarah' => 11, 'barah' => 12, 'bara' => 12,
        'ایک' => 1, 'دو' => 2, 'تین' => 3, 'چار' => 4, 'پانچ' => 5, 'چھ' => 6, 'سات' => 7, 'آٹھ' => 8, 'نو' => 9, 'دس' => 10, 'گیارہ' => 11, 'بارہ' => 12,
    ];

    /** "o'clock": the word that says the number before it is an hour. */
    public const O_CLOCK = ['baje', 'bajay', 'bajey', 'baj', 'بجے', 'oclock', 'ocloc'];

    /** @var array<string, string> morning, noon, afternoon and night words to the period they mean */
    public const PERIODS = [
        'am' => 'am', 'a.m' => 'am', 'pm' => 'pm', 'p.m' => 'pm',
        'morning' => 'am', 'subah' => 'am', 'subha' => 'am', 'sabah' => 'am', 'صبح' => 'am',
        'afternoon' => 'noon', 'dopahar' => 'noon', 'dopehar' => 'noon', 'dupahar' => 'noon', 'dophar' => 'noon', 'دوپہر' => 'noon',
        'evening' => 'pm', 'shaam' => 'pm', 'sham' => 'pm', 'شام' => 'pm',
        'night' => 'night', 'raat' => 'night', 'rat' => 'night', 'رات' => 'night',
    ];

    /** Doctor markers: the words after one are the doctor's name. */
    public const DOCTOR = ['dr', 'doctor', 'doc', 'daktar', 'doktar', 'dactar', 'ڈاکٹر', 'ڈاکٹرصاحب', 'ڈاکٹرصاحبہ'];

    /** Words that say "this is a booking" even when nothing else could be read. */
    public const BOOK = [
        'book', 'booking', 'schedule', 'appointment', 'appointments', 'appt', 'apointment', 'appoinment', 'buk', 'bukk', 'بک', 'اپائنٹمنٹ',
        'اپوائنٹمنٹ', 'اپائنٹمینٹ', 'اپوائنٹمینٹ', 'ملاقات',
    ];

    /** Asking to cancel, move or look something up is not a booking. */
    public const UNSUPPORTED = [
        'cancel', 'cancelled', 'canceled', 'canceling', 'cancelling', 'cancellation', 'cancle', 'reschedule', 'rescheduling', 'postpone', 'postponed',
        'move', 'shift', 'change', 'kinsal', 'cancal', 'badlo', 'badal', 'badalna', 'badlein', 'tabdeel', 'تبدیل', 'بدلیں', 'بدل', 'کینسل', 'منسوخ',
        'ملتوی', 'show', 'find', 'lookup', 'dikhao', 'dikhayen', 'dikhaiye', 'دکھائیں', 'دکھاؤ',
    ];

    /** Two-word ways of asking something that is not a booking. */
    public const UNSUPPORTED_PHRASES = [
        ['when', 'is'], ['what', 'time'], ['kab', 'hai'], ['kab', 'ka'], ['کب', 'ہے'], ['کب', 'کا'], ['look', 'up'], ['ری', 'شیڈول'],
    ];

    /** Words that are never part of a person's name: filler, "book", "appointment", polite words and the glue of each language. */
    public const STOP = [
        // English
        'book', 'booking', 'books', 'schedule', 'scheduled', 'make', 'set', 'setup', 'appointment', 'appointments', 'appt', 'apointment', 'appoinment',
        'visit', 'slot', 'time', 'please', 'plz', 'pls', 'kindly', 'for', 'a', 'an', 'the', 'with', 'at', 'on', 'in', 'to', 'of', 'and', 'or', 'me', 'my',
        'need', 'needs', 'want', 'wants', 'would', 'like', 'can', 'could', 'you', 'i', 'we', 'new', 'patient', 'name', 'is', 'called', 'named',
        'number', 'phone', 'mobile', 'contact', 'cell', 'next', 'this', 'coming', 'upcoming', 'by', 'from', 'it', 'that', 'her', 'his', 'him', 'she', 'he',
        'o', 'clock', 'sharp', 'around', 'about', 'day', 'after', 'of', 'th', 'st', 'nd', 'rd', 'be', 'get', 'got', 'have', 'has', 'see', 'seeing',
        'tomorrow', 'today', 'check', 'up', 'checkup', 'consultation', 'follow', 'review', 'put', 'down', 'hi', 'hello', 'hey', 'salam', 'assalam',
        'assalamualaikum', 'aoa', 'thanks', 'thank', 'ok', 'okay', 'just', 'also', 'add', 'register', 'enter', 'arrange', 'arranged', 'fix', 'fixed',
        'reserve', 'tareekh', 'tarikh',
        // Roman Urdu
        'karo', 'karna', 'karen', 'karein', 'kar', 'kijiye', 'kijiyay', 'kijiyey', 'kijye', 'karwana', 'karwani', 'karwa', 'karwao', 'karade', 'karado',
        'do', 'dein', 'dijiye', 'dijiyay', 'de', 'den', 'dena', 'diya', 'ka', 'ki', 'ke', 'ko', 'liye', 'lie', 'se', 'saath', 'sath', 'saathi', 'mein', 'me',
        'par', 'per', 'pe', 'ek', 'chahiye', 'chahye', 'chahta', 'chahti', 'chahte', 'chahtay', 'chahun', 'chahta', 'hai', 'hain', 'hun', 'hoon', 'ho', 'hoga',
        'hogi', 'wala', 'wali', 'wale', 'baje', 'bajay', 'bajey', 'tak', 'mareez', 'mareeza', 'marez', 'mujhe', 'mera', 'meri', 'mere', 'humein', 'hamein',
        'hum', 'aap', 'apna', 'apni', 'apne', 'lagao', 'lagana', 'lagwana', 'lagwa', 'lagado', 'laga', 'time', 'waqt', 'wqt', 'agle', 'agla', 'agli', 'is',
        'paas', 'pas', 'bhejna', 'bhejo', 'bhej', 'milna', 'milni', 'dikhana', 'dikhani', 'dedein', 'dena', 'dedo', 'ye', 'yeh', 'woh', 'wo', 'aur', 'ya', 'bhi', 'sirf', 'sahab', 'sahib', 'bukk', 'buk', 'bukking', 'naam', 'nam', 'number', 'subah', 'shaam',
        'dopahar', 'raat', 'kal', 'aaj', 'parson', 'kab', 'kya', 'kahan', 'kis', 'kisi', 'kon', 'kaun', 'ap', 'jee', 'ji', 'janab', 'check', 'up',
        // Urdu
        'کریں', 'کرو', 'کیجیے', 'کیجئے', 'کروانا', 'کرنا', 'دیں', 'دیجیے', 'دیجئے', 'دو', 'کا', 'کی', 'کے', 'کو', 'لیے', 'لئے', 'سے', 'ساتھ', 'میں', 'پر',
        'ایک', 'اپائنٹمنٹ', 'اپوائنٹمنٹ', 'اپائنٹمینٹ', 'اپوائنٹمینٹ', 'ملاقات', 'بک', 'وقت', 'مریض', 'مریضہ', 'چاہیے', 'چاہئے', 'چاہتا', 'چاہتی', 'ہے',
        'ہیں', 'ہوں', 'ہو', 'بجے', 'تک', 'میرا', 'میری', 'میرے', 'ہمیں', 'مجھے', 'اور', 'یا', 'بھی', 'صرف', 'ذرا', 'نام', 'نمبر', 'لگائیں', 'لگا', 'لگانا',
        'اگلے', 'اگلا', 'اگلی', 'یہ', 'وہ', 'جی', 'صبح', 'شام', 'دوپہر', 'رات', 'آج', 'کل', 'پرسوں', 'پاس', 'بھیجنا', 'ملنا', 'ملنی', 'دکھانا', 'ہیلو', 'سلام',
        'تاریخ', 'درج',
    ];
}
