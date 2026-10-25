const en = {
    common: {
        appName: 'VocaMed',
        language: 'Language',
        retry: 'Retry',
        confirm: 'Confirm',
        cancel: 'Cancel',
        save: 'Save',
        search: 'Search',
        loading: 'Loading…',
    },
    roles: {
        clinic_admin: 'Clinic Admin',
        receptionist: 'Receptionist',
        doctor: 'Doctor',
        patient: 'Patient',
    },
    status: {
        booked: 'Booked',
        confirmed: 'Confirmed',
        arrived: 'Arrived',
        in_consultation: 'In consultation',
        done: 'Done',
        cancelled: 'Cancelled',
        no_show: 'No-show',
    },
    channel: {
        sms: 'SMS',
        whatsapp: 'WhatsApp',
    },
    notificationStatus: {
        queued: 'Queued',
        sent: 'Sent',
        delivered: 'Delivered',
        failed: 'Failed',
    },
} as const;

export default en;
