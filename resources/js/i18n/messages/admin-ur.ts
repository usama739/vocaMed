import audit from './admin/audit-ur';
import doctors from './admin/doctors-ur';
import overview from './admin/overview-ur';
import services from './admin/services-ur';
import settings from './admin/settings-ur';
import staff from './admin/staff-ur';
import templates from './admin/templates-ur';

/** کلینک ایڈمن کی عبارتیں۔ ہر صفحے کی عبارت `admin/<page>-ur.ts` میں ہے۔ */
const adminUr = {
    crumb: 'کلینک ایڈمن',
    retry: 'دوبارہ کوشش کریں',
    loading: 'لوڈ ہو رہا ہے…',
    common: {
        save: 'محفوظ کریں',
        saving: 'محفوظ ہو رہا ہے…',
        cancel: 'منسوخ کریں',
        discard: 'تبدیلیاں رد کریں',
        unsaved: 'غیر محفوظ تبدیلیاں',
        leave: 'آپ کی تبدیلیاں محفوظ نہیں ہوئیں۔ کیا اس صفحے سے نکل کر انہیں کھو دیں؟',
        remove: 'ہٹائیں',
        edit: 'ترمیم',
        open: 'کھولیں',
        dismiss: 'بند کریں',
        on: 'آن',
        off: 'آف',
        active: 'فعال',
        inactive: 'غیر فعال',
        notFoundTitle: 'یہ نہیں ملا',
        notFoundBody: 'ہو سکتا ہے اسے ہٹا دیا گیا ہو۔ واپس جا کر دوسرا چنیں۔',
        earlier: '30 منٹ پہلے',
        later: '30 منٹ بعد',
        min: '{{count}} منٹ',
    },
    ...audit,
    ...doctors,
    ...overview,
    ...services,
    ...settings,
    ...staff,
    ...templates,
};

export default adminUr;
