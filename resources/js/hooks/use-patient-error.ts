import { useT } from '@/i18n/scope';
import { DataError } from '@/lib/data';

/**
 * Turns a failed patient action into a sentence in the patient's language. Like the staff version it
 * reads the error's `code`, never its English `message`, so it works for the mock and for Laravel's
 * 403 / 404 / 409 / 410 / 422 / 429 answers.
 */
export function usePatientError() {
    const { t } = useT();

    return (error: unknown): string => {
        if (error instanceof DataError) {
            switch (error.code) {
                case 'OUTSIDE_WINDOW':
                    return t('patient.errors.tooLate');
                case 'SLOT_UNAVAILABLE':
                    return t('patient.errors.taken');
                case 'INVALID_TRANSITION':
                    return t('patient.errors.gone');
                case 'LINK_EXPIRED':
                    return t('patient.errors.expired');
                case 'VALIDATION':
                    return t('patient.errors.invalidTime');
                case 'RATE_LIMITED':
                    return t('patient.expired.failed');
            }
        }

        return t('patient.errors.generic');
    };
}
