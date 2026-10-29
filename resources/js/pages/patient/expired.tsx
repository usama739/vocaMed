import { usePage } from '@inertiajs/react';
import { PatientShell } from '@/components/patient/patient-shell';
import { ExpiredPanel } from '@/components/patient/expired-panel';
import { ErrorState } from '@/components/vocamed/states';
import { usePatientView } from '@/hooks/use-patient-view';
import { useT } from '@/i18n/scope';

/** E4: the page at `/p/{token}/expired`. */
export default function Expired() {
    const { t } = useT();
    const { token } = usePage<{ token: string }>().props;
    const query = usePatientView('expired', token);

    if (query.status === 'ready' && query.data) {
        return <ExpiredPanel view={query.data} token={token} />;
    }

    return (
        <PatientShell>
            {query.status === 'error' ? (
                <div className="rounded-2xl border border-line bg-white shadow-soft">
                    <ErrorState onRetry={query.reload} />
                </div>
            ) : (
                <div
                    role="status"
                    aria-busy="true"
                    aria-label={t('patient.loading')}
                    className="h-56 animate-pulse rounded-2xl bg-status-booked/60 motion-reduce:animate-none"
                />
            )}
        </PatientShell>
    );
}
