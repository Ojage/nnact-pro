import * as React from 'react';

import { cn } from './utils';
import { Textarea } from './textarea';

export function getCharacterLimitState(value: string, maxLength: number) {
  const length = value.length;
  return {
    length,
    isOverLimit: length > maxLength,
    remaining: maxLength - length,
  };
}

export interface LimitedTextareaProps
  extends Omit<React.ComponentProps<typeof Textarea>, 'maxLength'> {
  maxLength: number;
  showCounter?: boolean;
  counterClassName?: string;
}

const LimitedTextarea = React.forwardRef<HTMLTextAreaElement, LimitedTextareaProps>(
  (
    {
      maxLength,
      showCounter = true,
      className,
      counterClassName,
      value = '',
      ...props
    },
    ref,
  ) => {
    const { length, isOverLimit } = getCharacterLimitState(String(value), maxLength);

    return (
      <div className="space-y-1">
        <Textarea
          ref={ref}
          value={value}
          aria-invalid={isOverLimit || undefined}
          className={cn(
            isOverLimit &&
              'border-destructive focus-visible:border-destructive aria-invalid:border-destructive',
            className,
          )}
          {...props}
        />
        {showCounter ? (
          <p
            aria-live="polite"
            className={cn(
              'text-xs text-right tabular-nums',
              isOverLimit ? 'text-destructive font-medium' : 'text-muted-foreground',
              counterClassName,
            )}
          >
            {length}/{maxLength}
          </p>
        ) : null}
      </div>
    );
  },
);

LimitedTextarea.displayName = 'LimitedTextarea';

export { LimitedTextarea };
