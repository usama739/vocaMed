import type { ComponentProps } from 'react';
import { FormField } from '@/components/vocamed/form-fields';
import { cn } from '@/lib/utils';

/** The browser's own select, styled like the other controls (the settings design uses native selects). */
export function NativeSelect({
    label,
    hint,
    error,
    options,
    className,
    fieldClassName,
    ...select
}: {
    label: string;
    hint?: string;
    error?: string;
    options: { value: string; label: string }[];
    fieldClassName?: string;
} & Omit<ComponentProps<'select'>, 'id' | 'children'>) {
    return (
        <FormField
            label={label}
            hint={hint}
            error={error}
            className={fieldClassName}
        >
            {(control) => (
                <select
                    {...control}
                    {...select}
                    className={cn(
                        'h-12 w-full rounded-md border border-line-strong bg-white px-3.5 text-control text-ink disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger',
                        className,
                    )}
                >
                    {options.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            )}
        </FormField>
    );
}
