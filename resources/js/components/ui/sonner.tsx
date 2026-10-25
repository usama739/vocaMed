import { useFlashToast } from '@/hooks/use-flash-toast';
import { useAppearance } from '@/hooks/use-appearance';
import { useT } from '@/i18n/scope';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

function Toaster({ ...props }: ToasterProps) {
    const { appearance } = useAppearance();
    const { dir } = useT();

    useFlashToast();

    return (
        <Sonner
            theme={appearance}
            className="toaster group"
            // Centred so it does not jump sides between left-to-right and right-to-left layouts.
            position="bottom-center"
            dir={dir}
            style={
                {
                    '--normal-bg': 'var(--popover)',
                    '--normal-text': 'var(--popover-foreground)',
                    '--normal-border': 'var(--border)',
                } as React.CSSProperties
            }
            {...props}
        />
    );
}

export { Toaster };
