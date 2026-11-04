import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    addDaysToDate,
    DataError,
    type ClinicSettings,
    type DataSource,
    type VoiceDraft,
    type VoiceRequestView,
} from '@/lib/data';
import { createMockDataSource } from '@/lib/data/mock';
import { createSeedDatabase, DEMO_CLINIC_ID } from '@/lib/data/seed';
import { renderIn } from '@/test/render';
import { BookingPanelBody } from './booking-panel';

/** The booking panel with a real-looking voice service behind it: what a receptionist's screen does with each answer. */
function setup(settings: Partial<ClinicSettings> = {}) {
    const db = createSeedDatabase();
    const base = createMockDataSource(db, {
        clinicId: DEMO_CLINIC_ID,
        actorId: 'u_test',
    });
    const voice = {
        transcribe: vi.fn(),
        parseText: vi.fn(),
        get: vi.fn(),
    };
    const source = {
        ...base,
        voice,
        clinic: {
            ...base.clinic,
            settings: async () => ({
                ...(await base.clinic.settings()),
                ...settings,
            }),
        },
    } as unknown as DataSource;

    return { source, voice, base };
}

/** What the server would resolve a request to: a real patient, doctor, service and free slot of the sample clinic. */
async function resolved(
    source: DataSource,
    overrides: Partial<VoiceDraft> = {},
) {
    const doctors = await source.doctors.list({ activeOnly: true });
    const services = await source.services.list({ activeOnly: true });
    const doctor = doctors.find((d) => d.serviceIds.length > 0)!;
    const service = services.find((s) => doctor.serviceIds.includes(s.id))!;
    const [patient] = await source.patients.recent(1);
    const slot = (await source.doctors.nextFreeSlot(doctor.id, service.id))!;
    const draft: VoiceDraft = {
        heard: 'Ayesha with Dr. Sana tomorrow at ten',
        patientId: patient.id,
        patientName: patient.name,
        phone: patient.phone,
        doctorId: doctor.id,
        serviceId: service.id,
        startsAt: slot.startsAt,
        lowConfidence: [],
        ...overrides,
    };

    return { draft, doctor, service, patient, slot };
}

const ready = (
    draft: VoiceDraft | null,
    extra: Partial<VoiceRequestView> = {},
): VoiceRequestView => ({
    id: 'v1',
    source: 'text',
    status: 'ready',
    transcript: draft?.heard ?? null,
    parsed: { kind: 'book' },
    draft,
    failureCode: null,
    ...extra,
});

async function typeRequest(
    user: ReturnType<typeof userEvent.setup>,
    text = 'Ayesha, Dr Sana, tomorrow at ten',
) {
    await user.type(await screen.findByLabelText('Or type the request'), text);
    await user.click(screen.getByRole('button', { name: 'Go' }));
}

describe('BookingPanelBody · voice tab with the voice service', () => {
    // A browser that can record (jsdom has no recorder of its own); typed requests do not need it, but the mic beside them does.
    beforeEach(() => {
        vi.stubGlobal('MediaRecorder', FakeRecorder);
        vi.stubGlobal('navigator', {
            ...navigator,
            mediaDevices: {
                getUserMedia: vi.fn(async () => ({ getTracks: () => [] })),
            },
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('reads a typed request on the server, shows what was understood, and books the patient the server found', async () => {
        const user = userEvent.setup();
        const { source, voice, base } = setup();
        const { draft, doctor, service, patient, slot } =
            await resolved(source);
        voice.parseText.mockResolvedValue({ id: 'v1' });
        voice.get.mockResolvedValue(ready(draft));
        const search = vi.spyOn(base.patients, 'search');
        const create = vi.spyOn(base.appointments, 'create');

        renderIn('en', <BookingPanelBody source={source} />);
        await typeRequest(user);

        expect(voice.parseText).toHaveBeenCalledWith(
            'Ayesha, Dr Sana, tomorrow at ten',
        );
        expect(
            await screen.findByText('Check before booking'),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/Ayesha with Dr\. Sana tomorrow at ten/),
        ).toBeInTheDocument();
        expect(screen.getByLabelText('Patient')).toHaveValue(patient.name);

        await user.click(
            await screen.findByRole('button', { name: 'Confirm booking' }),
        );

        expect(
            await screen.findByText('Booking confirmed'),
        ).toBeInTheDocument();
        expect(create).toHaveBeenCalledWith({
            patientId: patient.id,
            doctorId: doctor.id,
            serviceId: service.id,
            startsAt: slot.startsAt,
            source: 'voice',
        });
        // The server already matched the patient, so the panel does not look them up again.
        expect(search).not.toHaveBeenCalled();
    });

    it('asks for a check on every field the server was unsure of, and a choice settles it', async () => {
        const user = userEvent.setup();
        const { source, voice } = setup();
        const { draft, doctor } = await resolved(source, {
            lowConfidence: ['doctor', 'service', 'time'],
        });
        voice.parseText.mockResolvedValue({ id: 'v1' });
        voice.get.mockResolvedValue(ready(draft));

        renderIn('en', <BookingPanelBody source={source} />);
        await typeRequest(user);
        await screen.findByText('Check before booking');

        expect(screen.getAllByText('Please check')).toHaveLength(3);

        // Choosing the doctor settles the doctor and the service that goes with them.
        const doctorGroup = screen.getByRole('group', { name: 'Doctor' });
        await user.click(
            within(doctorGroup).getByRole('button', { name: doctor.name }),
        );

        expect(screen.getAllByText('Please check')).toHaveLength(1);
    });

    it('treats a name typed over the matched patient as a different person, found by phone or made new', async () => {
        const user = userEvent.setup();
        const { source, voice, base } = setup();
        const { draft } = await resolved(source);
        voice.parseText.mockResolvedValue({ id: 'v1' });
        voice.get.mockResolvedValue(ready(draft));
        const get = vi.spyOn(base.patients, 'get');
        const search = vi.spyOn(base.patients, 'search');

        renderIn('en', <BookingPanelBody source={source} />);
        await typeRequest(user);
        await user.type(await screen.findByLabelText('Patient'), ' Jr');
        await user.click(
            await screen.findByRole('button', { name: 'Confirm booking' }),
        );

        expect(
            await screen.findByText('Booking confirmed'),
        ).toBeInTheDocument();
        expect(get).not.toHaveBeenCalled();
        expect(search).toHaveBeenCalledWith(draft.phone, 1);
    });

    it('keeps the time the server picked when it is days away, instead of moving it to the first free slot', async () => {
        const user = userEvent.setup();
        const { source, voice, base } = setup();
        const first = await resolved(source);
        const clinic = await source.clinic.get();
        const today = new Intl.DateTimeFormat('en-CA', {
            timeZone: clinic.timezone,
        }).format(new Date());

        // The last free slot of the first day more than three days ahead that has any.
        let far: string | null = null;

        for (let ahead = 5; ahead < 14 && !far; ahead++) {
            const slots = await source.slots.list({
                doctorId: first.doctor.id,
                serviceId: first.service.id,
                date: addDaysToDate(today, ahead),
            });
            far =
                slots.filter((s) => s.state === 'free').at(-1)?.startsAt ??
                null;
        }

        expect(far).not.toBeNull();

        voice.parseText.mockResolvedValue({ id: 'v1' });
        voice.get.mockResolvedValue(ready({ ...first.draft, startsAt: far! }));
        const create = vi.spyOn(base.appointments, 'create');

        renderIn('en', <BookingPanelBody source={source} />);
        await typeRequest(user);
        await user.click(
            await screen.findByRole('button', { name: 'Confirm booking' }),
        );

        expect(
            await screen.findByText('Booking confirmed'),
        ).toBeInTheDocument();
        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({ startsAt: far }),
        );
    });

    it('moves a request it could only partly finish to the Manual tab, filled in as far as it goes', async () => {
        const user = userEvent.setup();
        const { source, voice, base } = setup();
        const { draft, patient } = await resolved(source, {
            doctorId: null,
            startsAt: null,
        });
        voice.parseText.mockResolvedValue({ id: 'v1' });
        voice.get.mockResolvedValue(ready(draft));
        const get = vi.spyOn(base.patients, 'get');

        renderIn('en', <BookingPanelBody source={source} />);
        await typeRequest(user);

        expect(
            await screen.findByText(
                /We understood part of the request: “Ayesha with Dr\. Sana tomorrow at ten”/,
            ),
        ).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Manual' })).toHaveAttribute(
            'aria-selected',
            'true',
        );
        expect(get).toHaveBeenCalledWith(patient.id);
        expect(
            await screen.findByRole('button', {
                name: new RegExp(patient.name),
            }),
        ).toHaveAttribute('aria-pressed', 'true');
    });

    it('offers a patient nobody knows as a new one, with what was heard', async () => {
        const user = userEvent.setup();
        const { source, voice } = setup();
        const { draft } = await resolved(source, {
            patientId: null,
            patientName: 'Zubair Ahmed',
            phone: '+923017654321',
            doctorId: null,
            lowConfidence: ['patient', 'doctor'],
        });
        voice.parseText.mockResolvedValue({ id: 'v1' });
        voice.get.mockResolvedValue(ready(draft));

        renderIn('en', <BookingPanelBody source={source} />);
        await typeRequest(user);

        await screen.findByText(/We understood part of the request/);
        expect(screen.getByDisplayValue('Zubair Ahmed')).toBeInTheDocument();
    });

    it('says voice only books when the request was to cancel or move a visit', async () => {
        const user = userEvent.setup();
        const { source, voice } = setup();
        voice.parseText.mockResolvedValue({ id: 'v1' });
        voice.get.mockResolvedValue(
            ready(null, { parsed: { kind: 'unsupported' } }),
        );

        renderIn('en', <BookingPanelBody source={source} />);
        await typeRequest(user, 'Cancel Ayesha tomorrow');

        expect(
            await screen.findByText(/Voice only makes new bookings/),
        ).toBeInTheDocument();
        // The mic is ready again (as "Try again") and the typed box is still there.
        expect(
            screen.getByRole('button', { name: 'Try again' }),
        ).toBeInTheDocument();
    });

    it.each([
        ['no_speech', /We did not hear anything/],
        ['rate_limited', /Voice is busy right now/],
        ['not_configured', /Voice is not set up for this clinic yet/],
        ['provider_auth', /Voice is not set up for this clinic yet/],
        ['unreadable', /We could not hear that clearly/],
    ])('explains a request that failed with %s', async (code, message) => {
        const user = userEvent.setup();
        const { source, voice } = setup();
        voice.parseText.mockResolvedValue({ id: 'v1' });
        voice.get.mockResolvedValue(
            ready(null, { status: 'failed', failureCode: code }),
        );

        renderIn('en', <BookingPanelBody source={source} />);
        await typeRequest(user);

        expect(await screen.findByText(message)).toBeInTheDocument();
        // The typed box is still there to try again with.
        expect(
            screen.getByLabelText('Or type the request'),
        ).toBeInTheDocument();
    });

    it.each([
        [new DataError('VOICE_OFF', 'off'), /switched off for this clinic/],
        [new DataError('RATE_LIMITED', 'slow'), /Voice is busy right now/],
        [new Error('network'), /We could not hear that clearly/],
    ])('explains a request the server refused (%s)', async (error, message) => {
        const user = userEvent.setup();
        const { source, voice } = setup();
        voice.parseText.mockRejectedValue(error);

        renderIn('en', <BookingPanelBody source={source} />);
        await typeRequest(user);

        expect(await screen.findByText(message)).toBeInTheDocument();
    });

    it('keeps the Voice tab when the clinic has voice switched off, opens on Manual, and says why voice does nothing', async () => {
        const user = userEvent.setup();
        const { source, voice } = setup({ voiceEnabled: false });

        renderIn('en', <BookingPanelBody source={source} />);

        // The tab is not taken away (a new clinic starts with voice off, and a receptionist would wonder where it went).
        expect(
            await screen.findByRole('tab', { name: 'Manual' }),
        ).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tab', { name: 'Voice' })).toBeInTheDocument();

        await user.click(screen.getByRole('tab', { name: 'Voice' }));

        expect(
            screen.getByText(
                /Voice booking is switched off for this clinic\. A clinic admin can switch it on under Settings/,
            ),
        ).toBeInTheDocument();
        // Nothing to tap or type into: the server would refuse both.
        expect(
            screen.queryByLabelText('Or type the request'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Tap to speak' }),
        ).not.toBeInTheDocument();
        expect(voice.parseText).not.toHaveBeenCalled();
    });

    it('opens on Voice when it is on, unless the person already chose another tab', async () => {
        const { source } = setup({ voiceEnabled: true });

        renderIn('en', <BookingPanelBody source={source} />);

        expect(
            await screen.findByRole('tab', { name: 'Voice' }),
        ).toHaveAttribute('aria-selected', 'true');
    });

    it('keeps the sample interpreter where there is no voice service (the open demo)', async () => {
        const user = userEvent.setup();
        const db = createSeedDatabase();
        const demo = createMockDataSource(db, {
            clinicId: DEMO_CLINIC_ID,
            actorId: 'u_test',
        });

        renderIn('en', <BookingPanelBody source={demo} />);
        await typeRequest(user);

        expect(
            await screen.findByText('Check before booking'),
        ).toBeInTheDocument();
    });
});

/** A browser that can record: a microphone that grants access, and a recorder that hands back some audio when stopped. */
class FakeRecorder {
    static isTypeSupported = () => true;

    state: 'inactive' | 'recording' = 'inactive';
    mimeType: string;
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    onerror: (() => void) | null = null;

    constructor(
        readonly stream: unknown,
        options?: { mimeType?: string },
    ) {
        this.mimeType = options?.mimeType ?? 'audio/webm';
    }

    start() {
        this.state = 'recording';
    }

    stop() {
        this.state = 'inactive';
        this.ondataavailable?.({
            data: new Blob(['audio'], { type: this.mimeType }),
        });
        this.onstop?.();
    }
}

describe('BookingPanelBody · the microphone', () => {
    let getUserMedia: ReturnType<typeof vi.fn>;
    let now = 0;

    beforeEach(() => {
        now = 1000;
        getUserMedia = vi.fn(async () => ({
            getTracks: () => [{ stop: vi.fn() }],
        }));
        vi.stubGlobal('MediaRecorder', FakeRecorder);
        vi.stubGlobal('navigator', {
            ...navigator,
            mediaDevices: { getUserMedia },
        });
        vi.spyOn(performance, 'now').mockImplementation(() => now);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('records on a tap, sends the recording when stopped, and shows what the server made of it', async () => {
        const user = userEvent.setup();
        const { source, voice } = setup();
        const { draft } = await resolved(source, {
            lowConfidence: ['patient'],
        });
        voice.transcribe.mockResolvedValue({ id: 'v1' });
        voice.get.mockResolvedValue(ready(draft, { source: 'audio' }));

        renderIn('en', <BookingPanelBody source={source} />);

        await user.click(
            await screen.findByRole('button', { name: 'Tap to speak' }),
        );
        expect(getUserMedia).toHaveBeenCalledWith({ audio: true });

        const stop = await screen.findByRole('button', {
            name: 'Listening… tap to stop',
        });
        now = 4500;
        await user.click(stop);

        await waitFor(() => expect(voice.transcribe).toHaveBeenCalledTimes(1));

        const [blob, seconds] = voice.transcribe.mock.calls[0];

        expect(blob).toBeInstanceOf(Blob);
        expect(seconds).toBeCloseTo(3.5, 5);
        expect(
            await screen.findByText('Check before booking'),
        ).toBeInTheDocument();
        expect(screen.getByText('Please check')).toBeInTheDocument();
    });

    it('does not spend a request on a recording too short to hold any words', async () => {
        const user = userEvent.setup();
        const { source, voice } = setup();

        renderIn('en', <BookingPanelBody source={source} />);

        await user.click(
            await screen.findByRole('button', { name: 'Tap to speak' }),
        );
        now = 1200;
        await user.click(
            await screen.findByRole('button', {
                name: 'Listening… tap to stop',
            }),
        );

        expect(
            await screen.findByText(/We did not hear anything/),
        ).toBeInTheDocument();
        expect(voice.transcribe).not.toHaveBeenCalled();
    });

    it('says so when the microphone is blocked, and points to the typed box', async () => {
        const user = userEvent.setup();
        const { source } = setup();
        getUserMedia.mockRejectedValue(
            new DOMException('no', 'NotAllowedError'),
        );

        renderIn('en', <BookingPanelBody source={source} />);
        await user.click(
            await screen.findByRole('button', { name: 'Tap to speak' }),
        );

        expect(
            await screen.findByText('Microphone is blocked'),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/Microphone access is off for this site/),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Type instead' }),
        ).toBeInTheDocument();
    });

    it('says so at once on a browser or address that cannot record, instead of a mic that does nothing', async () => {
        vi.stubGlobal('MediaRecorder', undefined);
        const { source } = setup();

        renderIn('en', <BookingPanelBody source={source} />);

        expect(await screen.findByText(/cannot record/)).toBeInTheDocument();
        expect(getUserMedia).not.toHaveBeenCalled();
    });

    it('works in Urdu with the same messages', async () => {
        const user = userEvent.setup();
        const { source, voice } = setup();
        voice.parseText.mockResolvedValue({ id: 'v1' });
        voice.get.mockResolvedValue(
            ready(null, { status: 'failed', failureCode: 'no_speech' }),
        );

        renderIn('ur', <BookingPanelBody source={source} />);
        await user.type(
            await screen.findByLabelText('یا درخواست ٹائپ کریں'),
            'عائشہ، کل تین بجے',
        );
        await user.click(screen.getByRole('button', { name: 'آگے' }));

        expect(
            await screen.findByText(/کوئی آواز سنائی نہیں دی/),
        ).toBeInTheDocument();
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});
