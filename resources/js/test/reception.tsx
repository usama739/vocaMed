import { render, type RenderResult } from '@testing-library/react';
import { vi } from 'vitest';
import type { ReactElement } from 'react';
import {
    ReceptionRuntimeContext,
    type ForcedState,
    type ReceptionRuntime,
} from '@/components/reception/runtime';
import { DataSourceProvider } from '@/hooks/use-data';
import type { Locale } from '@/i18n/locales';
import { LocaleScope } from '@/i18n/scope';
import type { DataSource } from '@/lib/data';
import { createMockDataSource } from '@/lib/data/mock';
import {
    createSeedDatabase,
    DEMO_CLINIC_ID,
    type MockDatabase,
} from '@/lib/data/seed';
import '@/test/render';

/** Monday 10:15 in Karachi: the clinic is open and today's seeded appointments are under way. */
export const MONDAY_MORNING = new Date('2026-10-26T05:15:00.000Z');
export const TODAY = '2026-10-26';

/** Freezes only the clock's `Date`, so timers and async data still run for real. */
export function freezeClock(at: Date = MONDAY_MORNING) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at);
}

export function receptionSource(actorId = 'u_recep'): {
    db: MockDatabase;
    source: DataSource;
} {
    const db = createSeedDatabase(new Date());
    const source = createMockDataSource(db, {
        clinicId: DEMO_CLINIC_ID,
        actorId,
        now: () => new Date(),
    });

    return { db, source };
}

export function fakeRuntime(
    overrides: Partial<ReceptionRuntime> = {},
): ReceptionRuntime {
    return {
        forced: null,
        epoch: 0,
        refresh: vi.fn(),
        openBooking: vi.fn(),
        openVoice: vi.fn(),
        openReschedule: vi.fn(),
        ...overrides,
    };
}

/** A reception page with its own data source and a runtime whose actions can be spied on. */
export function renderReception(
    ui: ReactElement,
    options: {
        locale?: Locale;
        source?: DataSource;
        runtime?: Partial<ReceptionRuntime>;
        forced?: ForcedState | null;
    } = {},
): RenderResult & { source: DataSource; runtime: ReceptionRuntime } {
    const source = options.source ?? receptionSource().source;
    const runtime = fakeRuntime({
        ...options.runtime,
        ...(options.forced !== undefined ? { forced: options.forced } : {}),
    });
    const result = render(
        <LocaleScope locale={options.locale ?? 'en'}>
            <DataSourceProvider source={source}>
                <ReceptionRuntimeContext.Provider value={runtime}>
                    {ui}
                </ReceptionRuntimeContext.Provider>
            </DataSourceProvider>
        </LocaleScope>,
    );

    return Object.assign(result, { source, runtime });
}
