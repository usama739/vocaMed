/** Clinic admin: Audit log copy (D8). */
const copy = {
    audit: {
        title: 'Audit log',
        sub: 'A read-only record of who did what in your clinic. Entries cannot be edited or removed.',
        loading: 'Loading the audit log',
        filters: 'Audit log filters',
        fDate: 'Date',
        fUser: 'User',
        fAction: 'Action',
        all: 'All',
        today: 'Today',
        last7: 'Last 7 days',
        last30: 'Last 30 days',
        count_one: '{{count}} entry',
        count_other: '{{count}} entries',
        readonly: 'Read-only',
        colTime: 'When',
        colUser: 'User',
        colAction: 'Action',
        colDetails: 'Details',
        emptyTitle: 'No activity matches these filters',
        emptyBody: 'Try a wider date range or clear the filters.',
        clear: 'Clear filters',
        categories: {
            booking: 'Booking created',
            edit: 'Appointment edited',
            cancel: 'Cancellation',
            login: 'Sign-in',
            settings: 'Settings changed',
            invite: 'Staff invited',
        },
        actors: {
            system: 'System',
            patient: 'Patient',
        },
        roles: {
            receptionist: 'receptionist',
            clinic_admin: 'clinic admin',
            doctor: 'doctor',
        },
        sources: {
            voice: ' (voice)',
            walk_in: ' (walk-in)',
            patient_link: ' (patient link)',
        },
        kinds: {
            confirmation: 'confirmation',
            reminder: 'reminder',
            reschedule: 'reschedule',
            cancellation: 'cancellation',
        },
        decisions: {
            approved: 'approved',
            rejected: 'rejected',
        },
        sections: {
            details: 'clinic details',
            hours: 'business hours',
            holidays: 'holidays',
            reminders: 'reminders and cancellation',
            voice: 'voice booking',
        },
        channels: {
            sms: 'SMS',
            whatsapp: 'WhatsApp',
        },
        details: {
            visit: '{{patient}}, {{doctor}}, {{when}}{{source}}',
            statusChanged:
                '{{patient}}, {{doctor}}: status changed from {{from}} to {{status}}',
            statusSet: '{{patient}}, {{doctor}}: status set to {{status}}',
            statusReverted:
                '{{patient}}, {{doctor}}: status moved back from {{from}} to {{status}}',
            rescheduled:
                '{{patient}}, {{doctor}}: moved from {{from}} to {{to}}',
            cancelled:
                '{{patient}}, {{doctor}}, {{when}}: appointment cancelled',
            messageResent: '{{patient}}: {{kind}} message sent again',
            requestDecided:
                '{{patient}}, {{doctor}}: reschedule request {{decision}}',
            patientCreated: 'A patient record was added',
            patientUpdated: 'A patient record was edited',
            notificationResent: 'A failed message was sent again',
            availability: 'A doctor’s weekly availability was updated',
            login: 'Signed in',
            loginNewDevice: 'Signed in from a new device',
            settings: 'Settings changed: {{sections}}',
            settingsPlain: 'Settings changed',
            templateUpdated:
                'The {{kind}} message ({{channel}}, {{language}}) was edited',
            templateReset:
                'The {{kind}} message ({{channel}}, {{language}}) went back to the default',
            serviceCreated: 'A service was added',
            serviceUpdated: 'A service was edited',
            serviceActivated: 'A service was turned on',
            serviceDeactivated: 'A service was turned off',
            doctorCreated: 'A doctor was added',
            doctorUpdated: 'A doctor’s profile was edited',
            doctorActivated: 'A doctor now accepts bookings',
            doctorDeactivated: 'A doctor no longer accepts bookings',
            invited: 'Invitation sent to {{email}} ({{role}})',
            invitationResent: 'Invitation sent again to {{email}}',
            revoked: 'Invitation to {{email}} revoked',
            userDeactivated: '{{email}} was deactivated',
            userReactivated: '{{email}} was reactivated',
        },
    },
};

export default copy;
