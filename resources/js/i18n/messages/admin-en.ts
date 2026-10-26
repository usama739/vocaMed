import audit from './admin/audit-en';
import doctors from './admin/doctors-en';
import overview from './admin/overview-en';
import services from './admin/services-en';
import settings from './admin/settings-en';
import staff from './admin/staff-en';
import templates from './admin/templates-en';

/**
 * Clinic admin copy (Overview, Doctors, Doctor profile, Staff, Services, Clinic settings,
 * Notification templates, Audit log). Each page's wording lives in `admin/<page>-en.ts`.
 */
const adminEn = {
    crumb: 'Clinic admin',
    retry: 'Try again',
    loading: 'Loading…',
    common: {
        save: 'Save',
        saving: 'Saving…',
        cancel: 'Cancel',
        discard: 'Discard changes',
        unsaved: 'Unsaved changes',
        leave: 'You have unsaved changes. Leave this page and lose them?',
        remove: 'Remove',
        edit: 'Edit',
        open: 'Open',
        dismiss: 'Dismiss',
        on: 'On',
        off: 'Off',
        active: 'Active',
        inactive: 'Inactive',
        notFoundTitle: 'We could not find that',
        notFoundBody: 'It may have been removed. Go back and pick another.',
        earlier: 'Earlier by 30 minutes',
        later: 'Later by 30 minutes',
        min: '{{count}} min',
    },
    ...audit,
    ...doctors,
    ...overview,
    ...services,
    ...settings,
    ...staff,
    ...templates,
};

export default adminEn;
