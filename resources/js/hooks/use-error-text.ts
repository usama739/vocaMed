import { useT } from '@/i18n/scope';
import { DataError } from '@/lib/data';

/**
 * Turns a failed request into a sentence in the page language. It reads the error's `code` and
 * `field`, never its English `message`, so it works the same for the mock and for Laravel's
 * 404 / 409 / 422 / 403 responses.
 */
export function useErrorText() {
    const { t } = useT();

    const message = (error: unknown): string => {
        if (error instanceof DataError) {
            switch (error.code) {
                case 'INVALID_PHONE':
                    return t('reception.errors.invalidPhone');
                case 'DUPLICATE_PHONE':
                    return t('reception.errors.duplicatePhone');
                case 'VALIDATION':
                    return error.field === 'name'
                        ? t('reception.errors.invalidName')
                        : t('reception.errors.invalid');
                case 'SLOT_UNAVAILABLE':
                    return t('reception.errors.slotTaken');
                case 'NOT_FOUND':
                    return t('reception.errors.notFound');
                case 'INVALID_TRANSITION':
                    return t('reception.errors.invalidTransition');
                case 'FORBIDDEN':
                    return t('reception.errors.forbidden');
                case 'DUPLICATE_EMAIL':
                    return t('reception.errors.duplicateEmail');
                case 'DUPLICATE_NAME':
                    return t('reception.errors.duplicateName');
                case 'LAST_ADMIN':
                    return t('reception.errors.lastAdmin');
                case 'UNKNOWN_VARIABLE':
                    return t('reception.errors.unknownVariable', {
                        name: error.detail ?? '',
                    });
            }
        }

        return t('reception.errors.generic');
    };

    /** The message, and the form field it belongs to (null for a general error). */
    const forField = (error: unknown) => ({
        field: error instanceof DataError ? error.field : null,
        message: message(error),
    });

    return { message, forField };
}
