import * as React from 'react';

import { Input } from './input';
import { formatNumberWithCommas, parseNumericValue } from '../../lib/currency';

type MoneyInputProps = Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & {
  value: number;
  onValueChange: (value: number) => void;
};

const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onValueChange, onFocus, onBlur, ...props }, ref) => {
    const [inputValue, setInputValue] = React.useState(() => formatNumberWithCommas(value));
    const [isFocused, setIsFocused] = React.useState(false);

    React.useEffect(() => {
      if (!isFocused) {
        setInputValue(formatNumberWithCommas(value));
      }
    }, [value, isFocused]);

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.target.value;
      const numericValue = parseNumericValue(nextValue);
      setInputValue(nextValue ? formatNumberWithCommas(numericValue) : '');
      onValueChange(numericValue);
    };

    const handleFocus = (event: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      onFocus?.(event);
    };

    const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      setInputValue(formatNumberWithCommas(value));
      onBlur?.(event);
    };

    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        value={inputValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
    );
  },
);

MoneyInput.displayName = 'MoneyInput';

export { MoneyInput };
export type { MoneyInputProps };
