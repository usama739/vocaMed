/** Account page (profile, password, notification preferences, sessions). */
const accountEn = {
    title: 'Account',
    sub: 'Your own details. These apply only to you, not to the clinic.',
    loading: 'Loading your account',
    retry: 'Try again',
    leave: 'You have unsaved changes. Leave this page and lose them?',
    profile: {
        title: 'Profile',
        name: 'Full name',
        email: 'Email',
        emailHint:
            'Your email is your sign-in. Ask a clinic admin to change it.',
        emailHintAdmin:
            'Your email is your sign-in. Contact VocaMed to change it.',
        language: 'Language',
        save: 'Save profile',
        saving: 'Saving…',
        saved: 'Profile saved',
        unsaved: 'Unsaved changes',
        errName: 'Enter your name.',
        failed: 'We could not save your profile. Try again.',
    },
    password: {
        title: 'Change password',
        current: 'Current password',
        new: 'New password',
        hint: 'At least 10 characters, with letters and numbers.',
        confirm: 'Confirm new password',
        change: 'Change password',
        changing: 'Changing…',
        changed: 'Password changed. Other sessions were signed out.',
        note: 'Other signed-in devices will be signed out.',
        errEmpty: 'Enter your current password.',
        errCurrent: 'That is not your current password.',
        errRule: 'Use at least 10 characters, with letters and numbers.',
        errMatch: 'The passwords do not match.',
        rate: 'Too many tries. Try again in a minute.',
        failed: 'We could not change your password. Try again.',
    },
    notifications: {
        title: 'Notification preferences',
        sub: 'Choose what reaches your email. In-app alerts always show.',
        failedReminders: {
            label: 'Failed reminders',
            help: 'Email me when a patient message could not be delivered.',
        },
        patientCancellations: {
            label: 'Patient cancellations',
            help: 'Email me when a patient cancels from their link.',
        },
        dailySummary: {
            label: 'Daily summary',
            help: 'Email me tomorrow’s schedule every evening.',
        },
        saved: 'Saved',
        failed: 'We could not save that choice, so it was put back.',
    },
    sessions: {
        title: 'Sessions',
        sub: 'Signed in on another computer or tablet? Sign out of everything except this one.',
        signOut: 'Sign out other sessions',
        dialogTitle: 'Sign out other sessions?',
        dialogText:
            'Enter your password to sign out of every other computer and tablet. You stay signed in here.',
        password: 'Your password',
        confirm: 'Sign out other sessions',
        cancel: 'Cancel',
        errPassword: 'That is not your password.',
        rate: 'Too many tries. Try again in a minute.',
        failed: 'We could not sign out the other sessions. Try again.',
        signedOut_one: '{{count}} other session was signed out.',
        signedOut_other: '{{count}} other sessions were signed out.',
        none: 'You are not signed in anywhere else.',
    },
};

export default accountEn;
