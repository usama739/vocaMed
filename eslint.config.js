import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Tailwind's physical-direction utilities break right-to-left (Urdu) layouts.
const PHYSICAL_CLASS =
    '(^|[\\s:"\'`])-?(ml|mr|pl|pr|left|right|text-left|text-right|border-l|border-r|rounded-l|rounded-r)-';

export default defineConfig([
    globalIgnores([
        'vendor',
        'node_modules',
        'public',
        'storage',
        'bootstrap',
        'resources/js/actions',
        'resources/js/routes',
        'resources/js/wayfinder',
        // shadcn/ui generated components; regenerate rather than hand-edit.
        'resources/js/components/ui',
    ]),
    js.configs.recommended,
    tseslint.configs.recommended,
    reactHooks.configs.flat.recommended,
    {
        languageOptions: { globals: globals.browser },
    },
    {
        files: ['resources/js/**/*.{ts,tsx}'],
        rules: {
            'no-restricted-syntax': [
                'error',
                {
                    selector: `Literal[value=/${PHYSICAL_CLASS}/]`,
                    message:
                        'Use logical utilities (ms-*, me-*, ps-*, pe-*, start-*, end-*, text-start, text-end, border-s, border-e, rounded-s, rounded-e) so Urdu (RTL) mirrors correctly.',
                },
                {
                    selector: `TemplateElement[value.raw=/${PHYSICAL_CLASS}/]`,
                    message:
                        'Use logical utilities so Urdu (RTL) mirrors correctly.',
                },
            ],
        },
    },
    {
        // Module augmentation must repeat the original generic parameters.
        files: ['**/*.d.ts'],
        rules: { '@typescript-eslint/no-unused-vars': 'off' },
    },
    {
        files: ['*.config.{js,ts}', 'e2e/**/*.ts'],
        languageOptions: { globals: globals.node },
    },
    prettier,
]);
