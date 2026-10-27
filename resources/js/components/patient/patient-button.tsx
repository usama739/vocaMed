import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** The big buttons on the patient pages: 56px tall, full width, easy to hit on a phone. */
const patientButton = cva(
    'inline-flex min-h-14 w-full items-center justify-center gap-2.5 rounded-[12px] px-4 text-[17px] font-semibold transition-colors disabled:cursor-not-allowed',
    {
        variants: {
            tone: {
                primary:
                    'bg-brand text-white hover:bg-brand-hover disabled:bg-[#c9d0df] disabled:text-copy',
                outline:
                    'border border-line-strong bg-white text-ink hover:bg-surface-hover disabled:opacity-60',
                danger: 'border border-line-strong bg-white text-danger-ink hover:bg-surface-hover disabled:opacity-60',
                destructive:
                    'bg-danger text-white hover:bg-danger-ink disabled:opacity-60',
                success: 'bg-[#dff3e4] text-[#14532d]',
            },
        },
        defaultVariants: { tone: 'primary' },
    },
);

export function PatientButton({
    tone,
    asChild = false,
    className,
    ...props
}: ComponentProps<'button'> &
    VariantProps<typeof patientButton> & { asChild?: boolean }) {
    const Comp = asChild ? Slot : 'button';

    return (
        <Comp
            data-slot="patient-button"
            className={cn(patientButton({ tone }), className)}
            {...props}
        />
    );
}
