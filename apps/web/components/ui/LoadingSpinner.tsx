import { cn } from '../../lib/utils';
import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
    size?: 'sm' | 'md' | 'lg' | 'xl';
    centered?: boolean;
}

export function LoadingSpinner({
    className,
    size = 'md',
    centered = false,
    ...props
}: LoadingSpinnerProps) {
    const sizeClasses = {
        sm: 'h-4 w-4',
        md: 'h-8 w-8',
        lg: 'h-12 w-12',
        xl: 'h-16 w-16',
    };

    const spinner = (
        <Loader2
            className={cn(
                'animate-spin text-primary',
                sizeClasses[size],
                className
            )}
        />
    );

    if (centered) {
        return (
            <div className="flex h-full w-full items-center justify-center p-4" {...props}>
                {spinner}
            </div>
        );
    }

    return <div {...props}>{spinner}</div>;
}
