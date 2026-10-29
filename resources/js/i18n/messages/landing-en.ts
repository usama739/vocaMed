const landingEn = {
    nav: {
        how: 'How it works',
        benefits: 'Benefits',
        plans: 'Plans',
        faq: 'FAQ',
    },
    hero: {
        badge: 'Early access for clinics',
        title: 'Appointments booked while the patient is still on the line.',
        sub: 'Say it or type it. VocaMed fills in the booking, you confirm, and reminders go out on their own. Less chasing, fewer empty chairs.',
        ctaStart: 'Start your clinic',
        ctaDemo: 'Request a demo',
        note: 'Built for the front desk. Works on desktop and tablet, in English and Urdu.',
    },
    mock: {
        title: 'New booking',
        voice: 'Voice',
        manual: 'Manual',
        heard: 'Heard',
        transcript: '“Check-up with Dr. Rahman tomorrow at 4 for Ayesha Khan.”',
        type: 'Type instead',
        review: 'Review before saving',
        hold: 'Slot held for {{time}}',
        check: 'Please check',
        patient: 'Patient',
        doctor: 'Doctor',
        service: 'Service',
        vPatient: 'Ayesha Khan',
        vDoctor: 'Dr. Rahman',
        vService: 'Check-up',
        vWhen: 'Tomorrow, 4:00 PM',
        confirm: 'Confirm',
        edit: 'Edit',
        discard: 'Discard',
        demo: 'Watch the 15-second demo',
        sample: 'Sample data',
        floatValue: '12',
        floatLabel: 'Reminders sent today',
    },
    benefits: {
        title: 'Three things that make the desk calmer',
        sub: 'Built around one test: can a booking be finished in under 15 seconds while the patient waits?',
        b1: {
            title: 'Faster booking',
            text: 'Say the booking or type it in one line. The form fills itself and you only check it.',
        },
        b2: {
            title: 'No double booking',
            text: 'Pick a slot and it is held for two minutes. If someone else takes it first, you see the three nearest alternatives.',
        },
        b3: {
            title: 'Automatic reminders',
            text: 'Patients get a reminder with a link to confirm, reschedule or cancel. No phone call needed.',
        },
    },
    how: {
        title: 'How it works',
        sub: 'Three steps, the same every time.',
        s1: {
            title: 'Say it or type it',
            text: 'Tap the mic or type a line like “check-up with Dr. Rahman tomorrow at 4”. Prefer clicking? The manual tab does the same job.',
        },
        s2: {
            title: 'Review and confirm',
            text: 'VocaMed fills in patient, doctor, service and time. Anything it is unsure about is highlighted. Nothing is booked until you press Confirm.',
        },
        s3: {
            title: 'The patient takes it from here',
            text: 'A reminder goes out with a private link. The patient confirms, reschedules or cancels, and your schedule updates by itself.',
        },
    },
    statuses: {
        title: 'Every visit has one clear status',
        sub: 'Each status has its own icon and label, so it reads at a glance and never depends on color alone.',
        booked: 'The slot is taken.',
        confirmed: 'The patient said yes.',
        arrived: 'At the front desk.',
        in_consultation: 'With the doctor.',
        done: 'The visit is finished.',
        cancelled: 'The slot is free again.',
        no_show: 'The patient did not arrive.',
    },
    patient: {
        title: 'Patients handle it from their phone',
        text: 'No app and no account. Each reminder carries a private link to a single page: confirm, pick another time, or cancel. Fewer calls for your desk, and cancelled slots open up for someone else.',
        p1: 'Works in English and Urdu',
        p2: 'Reschedule from the doctor’s real free slots',
        p3: 'An expired link shows the clinic’s phone number',
        yours: 'Your appointment',
        when: 'When',
        address: '[Clinic address]',
        map: 'Open map',
        confirm: 'Confirm',
        reschedule: 'Reschedule',
        cancel: 'Cancel',
    },
    roles: {
        title: 'One product, a simple view for each person',
        sub: 'Each role sees only what it needs, and the server enforces the same rules.',
        r1: {
            title: 'Receptionist',
            text: 'Today’s schedule by doctor, patient lookup by phone number, and a New booking button on every page.',
        },
        r2: {
            title: 'Clinic admin',
            text: 'Doctors, staff, services, opening hours, reminder timing and message templates in one place.',
        },
        r3: {
            title: 'Doctor',
            text: 'Own schedule, working hours, time off and a next-patient card.',
        },
        r4: {
            title: 'Patient',
            text: 'No account. A private link to confirm, reschedule or cancel.',
        },
    },
    trust: {
        title: 'Scheduling data only',
        sub: 'VocaMed is a booking tool, not a medical record.',
        t1: {
            title: 'No clinical notes',
            text: 'Screens show name, phone, time, service and an optional visit reason.',
        },
        t2: {
            title: 'Your own workspace',
            text: 'Every clinic gets an isolated workspace. Other clinics never see your data.',
        },
        t3: {
            title: 'You set voice retention',
            text: 'Switch voice on or off and choose how long audio is kept. Booking works fine without it.',
        },
        link: 'Read the privacy and terms',
    },
    plans: {
        title: 'Plans',
        sub: '[PLAN INTRO: ADD ONCE PLANS ARE DECIDED]',
        name: '[PLAN NAME]',
        for: '[WHO IT IS FOR]',
        incl: '[WHAT IS INCLUDED]',
    },
    faq: {
        title: 'Questions, answered plainly',
        q1: {
            q: 'Do I have to use voice?',
            a: 'No. Every booking can be finished by typing or clicking. Voice is a shortcut, never a requirement.',
        },
        q2: {
            q: 'Can voice book something by mistake?',
            a: 'No. Voice only fills a review card. Nothing is booked until the receptionist presses Confirm.',
        },
        q3: {
            q: 'What if two receptionists pick the same slot?',
            a: 'The first to pick holds it for two minutes. The other sees it disappear within about a second and is offered the nearest alternatives.',
        },
        q4: {
            q: 'Do patients need an account?',
            a: 'No. They use a private link sent by message. It opens one page where they can confirm, reschedule or cancel.',
        },
        q5: {
            q: 'Does it work in Urdu?',
            a: 'Yes. Screens and patient messages are built for English and Urdu, including right-to-left layout.',
        },
        q6: {
            q: 'How are reminders sent?',
            a: 'By SMS first, with WhatsApp planned for later. You choose the timing, for example 24 hours and 2 hours before.',
        },
        q7: {
            q: 'Does it store medical records?',
            a: 'No. Only scheduling details: name, phone, time, service and an optional visit reason.',
        },
    },
    cta: {
        title: 'Give your front desk a calmer day.',
        text: 'Start your clinic, or ask for a demo and we will walk you through a booking.',
    },
    footer: {
        tag: 'Voice-assisted appointments for clinics.',
        contact: '[CONTACT EMAIL]',
        privacy: 'Privacy and terms',
    },
    watch: {
        title: 'Watch the 15-second demo',
        clip: '[15-second demo clip to be supplied]',
        note: 'The demo clip is not ready yet. The booking window on the page plays the same flow with sample data.',
        close: 'Close',
    },
    request: {
        title: 'Request a demo',
        lead: 'Tell us who you are and we will walk you through a booking.',
        name: 'Your name',
        clinic: 'Clinic name',
        contact: 'Email or phone',
        submit: 'Send request',
        placeholder:
            'This form is a placeholder: requests are not sent anywhere yet.',
        sentTitle: 'Nothing was sent',
        sentText:
            'This form is a placeholder until a destination for demo requests is set up.',
        close: 'Close',
    },
} as const;

export default landingEn;
