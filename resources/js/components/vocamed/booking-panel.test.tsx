import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createMockDataSource } from '@/lib/data/mock';
import { createSeedDatabase, DEMO_CLINIC_ID } from '@/lib/data/seed';
import { renderIn } from '@/test/render';
import { BookingPanelBody } from './booking-panel';

// Each test gets its own database and its own acting user, so holds never leak between tests.
function setup() {
    const db = createSeedDatabase();
    const source = createMockDataSource(db, {
        clinicId: DEMO_CLINIC_ID,
        actorId: 'u_test',
    });

    return { db, source };
}

/** Click through the next three days until one has free times; weekends and holidays may not. */
async function pickFirstFreeSlot(user: ReturnType<typeof userEvent.setup>) {
    const dateGroup = await screen.findByRole('group', { name: 'Date' });

    for (const chip of within(dateGroup).getAllByRole('button')) {
        await user.click(chip);
        const timeGroup = screen.getByRole('group', { name: 'Time' });

        await waitFor(() =>
            expect(
                within(timeGroup).queryByText('Loading…'),
            ).not.toBeInTheDocument(),
        );

        const free = within(timeGroup)
            .queryAllByRole('button')
            .find((button) => !(button as HTMLButtonElement).disabled);

        if (free) {
            await user.click(free);

            return free;
        }
    }

    throw new Error('no free slot in the next three days');
}

describe('BookingPanelBody · manual tab', () => {
    it('books a slot: pick patient, pick time, hold with countdown, confirm', async () => {
        const user = userEvent.setup();
        const { source } = setup();
        const { container } = renderIn(
            'en',
            <BookingPanelBody source={source} initial={{ tab: 'manual' }} />,
        );

        // Recent patients are listed before anyone types.
        const [patient] = await screen.findAllByRole('button', {
            name: /\+92\d{9,}/,
        });
        await user.click(patient);
        expect(patient).toHaveAttribute('aria-pressed', 'true');

        await pickFirstFreeSlot(user);

        // The slot is now held for this user, with a visible 2-minute countdown.
        const timer = await screen.findByRole('timer');
        expect(timer).toHaveTextContent('Slot held for you');
        expect(timer).toHaveTextContent(/[12]:\d\d/);

        await user.click(
            screen.getByRole('button', { name: 'Confirm booking' }),
        );

        expect(
            await screen.findByText('Booking confirmed'),
        ).toBeInTheDocument();
        expect(container).toHaveTextContent('Sample data. Nothing is saved.');

        const booked = await source.appointments.list({
            sort: '-startsAt',
            perPage: 50,
        });
        expect(
            booked.items.some(
                (a) => a.source === 'manual' && a.createdAt >= '2026',
            ),
        ).toBe(true);
    });

    it('asks for a patient and a time before booking', async () => {
        const user = userEvent.setup();
        const { source } = setup();
        renderIn(
            'en',
            <BookingPanelBody source={source} initial={{ tab: 'manual' }} />,
        );

        await user.click(
            await screen.findByRole('button', { name: 'Confirm booking' }),
        );
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Choose or add a patient.',
        );

        await user.click(screen.getByRole('button', { name: 'New patient' }));
        await user.type(screen.getByLabelText('New patient name'), 'Walk In');
        await user.click(
            screen.getByRole('button', { name: 'Confirm booking' }),
        );
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Choose a free time.',
        );
    });

    it('shows a slot held by another receptionist as disabled "Held"', async () => {
        const { db, source } = setup();
        const other = createMockDataSource(db, {
            clinicId: DEMO_CLINIC_ID,
            actorId: 'u_other',
        });
        const doctor = (await source.doctors.list())[0];
        const service = (await source.services.list()).find((s) =>
            doctor.serviceIds.includes(s.id),
        );
        const free = await source.doctors.nextFreeSlot(doctor.id, service!.id);
        await other.slots.hold({
            doctorId: doctor.id,
            serviceId: service!.id,
            startsAt: free!.startsAt,
        });

        const user = userEvent.setup();
        renderIn(
            'en',
            <BookingPanelBody
                source={source}
                initial={{
                    tab: 'manual',
                    doctorId: doctor.id,
                    startsAt: free!.startsAt,
                }}
            />,
        );

        const heldButton = await screen.findByRole('button', { name: /Held$/ });

        expect(heldButton).toBeDisabled();
        await user.click(heldButton); // no-op, must not throw or select
        expect(heldButton).toHaveAttribute('aria-pressed', 'false');
    });
});

describe('BookingPanelBody · voice tab', () => {
    it('goes from typed request to a review card, then books after Confirm only', async () => {
        const user = userEvent.setup();
        const { source } = setup();
        renderIn('en', <BookingPanelBody source={source} />);

        const before = (await source.appointments.list({ perPage: 100 })).total;

        await user.type(
            await screen.findByLabelText('Or type the request'),
            'sample request',
        );
        await user.click(screen.getByRole('button', { name: 'Go' }));

        // Review card: low-confidence field flagged, hold running, nothing booked yet.
        expect(
            await screen.findByText('Check before booking'),
        ).toBeInTheDocument();
        expect(screen.getByText('Please check')).toBeInTheDocument();
        expect(await screen.findByRole('timer')).toBeInTheDocument();
        expect((await source.appointments.list({ perPage: 100 })).total).toBe(
            before,
        );

        await user.click(
            screen.getByRole('button', { name: 'Confirm booking' }),
        );

        expect(
            await screen.findByText('Booking confirmed'),
        ).toBeInTheDocument();
        expect((await source.appointments.list({ perPage: 100 })).total).toBe(
            before + 1,
        );
    });

    it('Discard goes back to the start without booking', async () => {
        const user = userEvent.setup();
        const { source } = setup();
        renderIn('en', <BookingPanelBody source={source} />);
        const before = (await source.appointments.list({ perPage: 100 })).total;

        await user.type(
            await screen.findByLabelText('Or type the request'),
            'sample request',
        );
        await user.click(screen.getByRole('button', { name: 'Go' }));
        await user.click(
            await screen.findByRole('button', { name: 'Discard' }),
        );

        expect(
            await screen.findByRole('button', { name: 'Tap to speak' }),
        ).toBeInTheDocument();
        expect((await source.appointments.list({ perPage: 100 })).total).toBe(
            before,
        );
    });

    it('mirrors the whole panel in Urdu', async () => {
        const { source } = setup();
        const { container } = renderIn(
            'ur',
            <BookingPanelBody source={source} />,
        );

        expect(
            await screen.findByRole('tab', { name: 'آواز' }),
        ).toHaveAttribute('aria-selected', 'true');
        expect(
            container.querySelector('[dir="rtl"][lang="ur"]'),
        ).not.toBeNull();
    });
});
