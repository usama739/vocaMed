import { CircleAlert } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useT } from '@/i18n/scope';
import { cn } from '@/lib/utils';

/** Props a control must receive so its label, hint and error are announced together. */
export type FieldControlProps = {
    id: string;
    'aria-describedby'?: string;
    'aria-invalid'?: true;
};

type FieldChrome = {
    label: string;
    hint?: string;
    /** Inline error text. Shown with an icon, never colour alone. */
    error?: string;
    optional?: boolean;
    className?: string;
};

/**
 * Label + control + hint + inline error. The control is rendered by `children` so any input
 * (text, select, phone) gets the same wiring: `<FormField label="…">{(p) => <Input {...p} />}</FormField>`.
 */
export function FormField({
    label,
    hint,
    error,
    optional,
    className,
    children,
}: FieldChrome & { children: (props: FieldControlProps) => ReactNode }) {
    const { t } = useT();
    const id = useId();
    const hintId = `${id}-hint`;
    const errorId = `${id}-error`;
    const describedBy =
        [error ? errorId : null, hint ? hintId : null]
            .filter(Boolean)
            .join(' ') || undefined;

    return (
        <div className={cn('flex flex-col gap-1.5', className)}>
            <Label htmlFor={id}>
                {label}
                {optional && (
                    <span className="ms-1.5 font-normal text-subtle">
                        {t('common.optional')}
                    </span>
                )}
            </Label>
            {children({
                id,
                'aria-describedby': describedBy,
                ...(error ? { 'aria-invalid': true as const } : {}),
            })}
            {hint && (
                <p id={hintId} className="text-small text-subtle">
                    {hint}
                </p>
            )}
            {error && (
                <p
                    id={errorId}
                    role="alert"
                    className="flex items-start gap-1.5 text-label font-medium text-danger-ink"
                >
                    <CircleAlert
                        aria-hidden="true"
                        className="mt-1 size-4 shrink-0"
                    />
                    {error}
                </p>
            )}
        </div>
    );
}

type InputProps = Omit<React.ComponentProps<typeof Input>, 'id'>;

export function TextField({
    label,
    hint,
    error,
    optional,
    className,
    ...input
}: FieldChrome & InputProps) {
    return (
        <FormField
            label={label}
            hint={hint}
            error={error}
            optional={optional}
            className={className}
        >
            {(control) => <Input {...control} {...input} />}
        </FormField>
    );
}

export function PasswordField({
    label,
    hint,
    error,
    className,
    ...input
}: Omit<FieldChrome, 'optional'> & Omit<InputProps, 'type'>) {
    const { t } = useT();
    const [shown, setShown] = useState(false);

    return (
        <FormField
            label={label}
            hint={hint}
            error={error}
            className={className}
        >
            {(control) => (
                <div className="relative">
                    <Input
                        {...control}
                        {...input}
                        type={shown ? 'text' : 'password'}
                        dir="ltr"
                        className="pe-20 text-start"
                    />
                    <button
                        type="button"
                        aria-label={t('form.showHidePassword')}
                        aria-pressed={shown}
                        onClick={() => setShown((v) => !v)}
                        className="absolute end-0.5 top-0.5 h-11 min-w-11 rounded-sm px-3 text-label font-semibold text-brand-hover hover:bg-surface-hover"
                    >
                        {shown ? t('form.hide') : t('form.show')}
                    </button>
                </div>
            )}
        </FormField>
    );
}

/**
 * Phone number with the clinic's country code in front. Callers receive the international
 * form (`+923001234567`), which is what the server stores.
 */
export function PhoneField({
    label,
    hint,
    error,
    optional,
    className,
    countryCode = '+92',
    value,
    onValueChange,
    ...input
}: FieldChrome &
    Omit<InputProps, 'type' | 'value' | 'onChange'> & {
        countryCode?: string;
        /** International format, e.g. +923001234567. */
        value: string;
        onValueChange: (e164: string) => void;
    }) {
    const national = value.startsWith(countryCode)
        ? value.slice(countryCode.length)
        : value.replace(/^\+/, '');

    return (
        <FormField
            label={label}
            hint={hint}
            error={error}
            optional={optional}
            className={className}
        >
            {(control) => (
                <div className="flex gap-2" dir="ltr">
                    <span
                        aria-hidden="true"
                        className="inline-flex h-12 min-w-16 items-center justify-center rounded-md border border-line bg-surface-subtle px-3 text-body font-semibold text-ink"
                    >
                        {countryCode}
                    </span>
                    <Input
                        {...control}
                        {...input}
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel-national"
                        value={national}
                        onChange={(event) => {
                            const digits = event.target.value
                                .replace(/\D/g, '')
                                .replace(/^0+/, '');
                            onValueChange(
                                digits ? `${countryCode}${digits}` : '',
                            );
                        }}
                    />
                </div>
            )}
        </FormField>
    );
}

export function TextareaField({
    label,
    hint,
    error,
    optional,
    className,
    ...area
}: FieldChrome & Omit<React.ComponentProps<typeof Textarea>, 'id'>) {
    return (
        <FormField
            label={label}
            hint={hint}
            error={error}
            optional={optional}
            className={className}
        >
            {(control) => <Textarea {...control} {...area} />}
        </FormField>
    );
}

export function SelectField({
    label,
    hint,
    error,
    optional,
    className,
    placeholder,
    options,
    value,
    onValueChange,
    disabled,
}: FieldChrome & {
    placeholder?: string;
    options: { value: string; label: string }[];
    value?: string;
    onValueChange: (value: string) => void;
    disabled?: boolean;
}) {
    const { dir, locale } = useT();

    return (
        <FormField
            label={label}
            hint={hint}
            error={error}
            optional={optional}
            className={className}
        >
            {(control) => (
                <Select
                    dir={dir}
                    value={value}
                    onValueChange={onValueChange}
                    disabled={disabled}
                >
                    <SelectTrigger {...control} className="w-full">
                        <SelectValue placeholder={placeholder} />
                    </SelectTrigger>
                    <SelectContent lang={locale} dir={dir}>
                        {options.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}
        </FormField>
    );
}

export function CheckboxField({
    label,
    checked,
    onCheckedChange,
    disabled,
    className,
}: {
    label: string;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    disabled?: boolean;
    className?: string;
}) {
    return (
        <label
            className={cn(
                'flex min-h-11 cursor-pointer items-center gap-3 text-control text-ink',
                disabled && 'cursor-not-allowed opacity-50',
                className,
            )}
        >
            <Checkbox
                checked={checked}
                disabled={disabled}
                onCheckedChange={(next) => onCheckedChange(next === true)}
            />
            {label}
        </label>
    );
}
