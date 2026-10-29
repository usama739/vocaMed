import { router } from '@inertiajs/react';
import { useEffect } from 'react';

/**
 * The account lives at /account now (name, language, password, email choices, sessions). The starter
 * kit's settings pages are not part of the product, so they only send the visitor there.
 */
export default function RedirectToAccount() {
    useEffect(() => {
        router.visit('/account', { replace: true });
    }, []);

    return null;
}
