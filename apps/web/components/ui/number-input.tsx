/**
 * Animated Number Input Component
 * Beautiful number input with smooth animations and increment/decrement buttons
 * Uses @number-flow/react for animated number transitions
 */

import NumberFlow from "@number-flow/react";
import clsx from "clsx";
import { Minus, Plus } from "lucide-react";
import * as React from "react";
import { cn } from "./utils";

interface NumberInputProps {
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  onChange?: (value: number) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  name?: string;
  required?: boolean;
  "aria-label"?: string;
}

export function NumberInput({
  value = 0,
  min = -Infinity,
  max = Infinity,
  step = 1,
  onChange,
  className,
  disabled = false,
  placeholder,
  id,
  name,
  required,
  "aria-label": ariaLabel,
}: NumberInputProps) {
  const defaultValue = React.useRef(value);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [animated, setAnimated] = React.useState(true);
  // Hide the caret during transitions so you can't see it shifting around:
  const [showCaret, setShowCaret] = React.useState(true);

  const handleInput: React.ChangeEventHandler<HTMLInputElement> = ({
    currentTarget: el,
  }) => {
    setAnimated(false);
    if (el.value === "") {
      onChange?.(defaultValue.current);
      return;
    }
    const num = parseFloat(el.value);
    if (
      isNaN(num) ||
      (min != null && num < min) ||
      (max != null && num > max)
    ) {
      // Revert input's value:
      el.value = String(value);
    } else {
      // Manually update value in case they e.g. start with a "0" or end with a "."
      // which won't trigger a DOM update (because the number is the same):
      el.value = String(num);
      onChange?.(num);
    }
  };

  const handlePointerDown =
    (diff: number) => (event: React.PointerEvent<HTMLButtonElement>) => {
      setAnimated(true);
      if (event.pointerType === "mouse") {
        event?.preventDefault();
        inputRef.current?.focus();
      }
      const newVal = Math.min(Math.max(value + diff * step, min), max);
      onChange?.(newVal);
    };

  return (
    <div
      className={cn(
        "group flex items-stretch rounded-md border border-[--color-border-default] bg-[--color-canvas-default] transition-[box-shadow]",
        "focus-within:border-[--color-accent-emphasis] focus-within:ring-2 focus-within:ring-[--color-accent-emphasis]/20",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        className={cn(
          "flex items-center justify-center px-3 transition-colors",
          "hover:bg-[--color-canvas-subtle]",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        )}
        disabled={disabled || (min != null && value <= min)}
        onPointerDown={handlePointerDown(-1)}
      >
        <Minus className="h-4 w-4 text-[--color-fg-muted]" strokeWidth={2} />
      </button>
      <div className="relative grid flex-1 items-center justify-items-center text-center [grid-template-areas:'overlap'] *:[grid-area:overlap]">
        <input
          ref={inputRef}
          id={id}
          name={name}
          required={required}
          aria-label={ariaLabel}
          className={clsx(
            showCaret ? "caret-[--color-accent-emphasis]" : "caret-transparent",
            "w-full bg-transparent py-2 px-1 text-center font-[inherit] text-transparent outline-none",
            "text-sm"
          )}
          // Make sure to disable kerning, to match NumberFlow:
          style={{ fontKerning: "none" }}
          type="number"
          min={min}
          step={step}
          autoComplete="off"
          inputMode="numeric"
          max={max}
          value={value}
          onInput={handleInput}
          disabled={disabled}
          placeholder={placeholder}
        />
        <NumberFlow
          value={value}
          format={{ useGrouping: false }}
          aria-hidden
          animated={animated}
          onAnimationsStart={() => setShowCaret(false)}
          onAnimationsFinish={() => setShowCaret(true)}
          className="pointer-events-none text-sm text-[--color-fg-default]"
          willChange
        />
      </div>
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        className={cn(
          "flex items-center justify-center px-3 transition-colors",
          "hover:bg-[--color-canvas-subtle]",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        )}
        disabled={disabled || (max != null && value >= max)}
        onPointerDown={handlePointerDown(1)}
      >
        <Plus className="h-4 w-4 text-[--color-fg-muted]" strokeWidth={2} />
      </button>
    </div>
  );
}

// Compact version for inline use
export function CompactNumberInput({
  value = 0,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  className,
  inputClassName,
  valueClassName,
  buttonClassName,
  disabled = false,
}: Omit<NumberInputProps, "placeholder" | "id" | "name"> & {
  inputClassName?: string;
  valueClassName?: string;
  buttonClassName?: string;
}) {
  const [animated, setAnimated] = React.useState(true);
  const [showCaret, setShowCaret] = React.useState(true);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleIncrement = () => {
    setAnimated(true);
    const newVal = Math.min(value + step, max);
    onChange?.(newVal);
  };

  const handleDecrement = () => {
    setAnimated(true);
    const newVal = Math.max(value - step, min);
    onChange?.(newVal);
  };

  const handleInput: React.ChangeEventHandler<HTMLInputElement> = ({
    currentTarget: el,
  }) => {
    setAnimated(false);
    if (el.value === "") {
      onChange?.(min);
      return;
    }
    const num = parseFloat(el.value);
    if (
      isNaN(num) ||
      (min != null && num < min) ||
      (max != null && num > max)
    ) {
      el.value = String(value);
    } else {
      onChange?.(num);
    }
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-md border border-[--color-border-default] bg-[--color-canvas-default] p-1",
        "focus-within:border-[--color-accent-emphasis] focus-within:ring-1 focus-within:ring-[--color-accent-emphasis]/20",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
      onClick={() => inputRef.current?.focus()}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleDecrement();
        }}
        disabled={disabled || value <= min}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded hover:bg-[--color-canvas-subtle]",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent cursor-pointer",
          buttonClassName
        )}
        tabIndex={-1}
      >
        <Minus className="h-3 w-3 text-[--color-fg-muted]" strokeWidth={2} />
      </button>

      <div className="relative grid flex-1 items-center justify-items-center text-center [grid-template-areas:'overlap'] *:[grid-area:overlap]">
        <input
          ref={inputRef}
          className={clsx(
            showCaret ? "caret-[--color-accent-emphasis]" : "caret-transparent",
            "w-full min-w-[3rem] bg-transparent py-0 text-center font-[inherit] text-transparent outline-none",
            "text-sm",
            inputClassName
          )}
          style={{ fontKerning: "none" }}
          type="number"
          min={min}
          step={step}
          max={max}
          value={value}
          onInput={handleInput}
          disabled={disabled}
        />
        <NumberFlow
          value={value}
          format={{ useGrouping: false }}
          animated={animated}
          onAnimationsStart={() => setShowCaret(false)}
          onAnimationsFinish={() => setShowCaret(true)}
          className={cn("pointer-events-none text-sm text-[--color-fg-default]", valueClassName)}
          willChange
        />
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleIncrement();
        }}
        disabled={disabled || value >= max}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded hover:bg-[--color-canvas-subtle]",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent cursor-pointer",
          buttonClassName
        )}
        tabIndex={-1}
      >
        <Plus className="h-3 w-3 text-[--color-fg-muted]" strokeWidth={2} />
      </button>
    </div>
  );
}

export default NumberInput;
