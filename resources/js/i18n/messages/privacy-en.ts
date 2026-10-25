const privacyEn = {
    title: 'Privacy and terms',
    intro: 'VocaMed is a booking tool for clinics. This page explains what it stores, how voice is handled, and who else is involved.',
    updated: 'Last updated: [DATE]',
    document: 'Document',
    tabPrivacy: 'Privacy',
    tabTerms: 'Terms of service',
    onPage: 'On this page',
    privacy: {
        stored: {
            h: 'What patient data is stored',
            p: 'Only scheduling data: name, phone number, appointment time, service and an optional visit reason. For each patient the clinic can also record a preferred language and channel (SMS or WhatsApp), whether the patient agreed to receive messages, and non-clinical notes. VocaMed shows upcoming and past appointments and a no-show count. It does not store clinical notes or diagnoses.',
        },
        voice: {
            h: 'How long voice audio is kept',
            p: 'Voice is optional. When a clinic turns it on, a spoken booking is recorded in the browser and sent for transcription. The clinic chooses how long the audio is kept: [RETENTION OPTIONS, E.G. DELETE AFTER TRANSCRIPTION / 7 DAYS / 30 DAYS]. A clinic can switch voice off at any time, and every booking can be finished by typing instead.',
        },
        messages: {
            h: 'Messages to patients',
            p: 'Patients receive confirmations and reminders by SMS. [WHATSAPP: ADD ONCE AVAILABLE]. Each message holds a private link for one appointment. Patients do not create accounts, and an expired link only shows the clinic’s phone number.',
        },
        vendors: {
            h: 'Vendors we use',
            p: 'Speech-to-text: [SPEECH-TO-TEXT PROVIDER]. Text messages: [SMS PROVIDER]. Hosting: [HOSTING PROVIDER AND REGION]. We will list every vendor that handles patient data here.',
        },
        access: {
            h: 'Who can see the data',
            p: 'Each clinic has its own isolated workspace. Within a clinic, every role sees only what it needs, and the server enforces the same rules. An audit log records who booked, changed or cancelled what, and when.',
        },
        requests: {
            h: 'Data requests and contact',
            p: 'To ask about, correct or delete data, write to [PRIVACY CONTACT EMAIL]. [DESCRIBE HOW CLINIC AND VOCAMED SHARE RESPONSIBILITY: CONFIRM WITH YOUR LAWYER].',
        },
    },
    terms: {
        use: {
            h: 'Using VocaMed',
            p: '[LEGAL TEXT TO BE SUPPLIED: WHAT THE SERVICE IS AND WHO MAY USE IT]',
        },
        accounts: {
            h: 'Accounts and roles',
            p: '[LEGAL TEXT TO BE SUPPLIED: ADMIN, RECEPTIONIST AND DOCTOR ACCOUNTS, INVITATIONS, KEEPING PASSWORDS SAFE]',
        },
        clinic: {
            h: 'What clinics are responsible for',
            p: '[LEGAL TEXT TO BE SUPPLIED: PATIENT CONSENT FOR MESSAGES, ACCURACY OF SCHEDULES]',
        },
        plans: {
            h: 'Plans and payment',
            p: '[LEGAL TEXT TO BE SUPPLIED ONCE PLANS ARE DECIDED]',
        },
        liability: {
            h: 'Limits of liability',
            p: '[LEGAL TEXT TO BE SUPPLIED]',
        },
        changes: {
            h: 'Changes to these terms',
            p: '[LEGAL TEXT TO BE SUPPLIED]',
        },
    },
} as const;

export default privacyEn;
