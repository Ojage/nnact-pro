"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
import { cn } from "./utils";

const EMPTY_VALUE = "__empty__";

export type FormSelectOption = {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
};

export type FormSelectProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: FormSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  size?: "sm" | "default";
  /** When true, adds a selectable empty option mapped to `""`. */
  allowEmpty?: boolean;
  emptyLabel?: string;
  /** When true, renders a native `<select>` instead of the Radix dropdown. */
  native?: boolean;
  /** Accessible name for the control, overriding any associated label. */
  ariaLabel?: string;
};

export function FormSelect({
  id,
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled,
  className,
  triggerClassName,
  size = "default",
  allowEmpty = false,
  emptyLabel,
  native = false,
  ariaLabel,
}: FormSelectProps) {
  if (native) {
    return (
      <select
        id={id}
        aria-label={ariaLabel}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "mt-1.5 h-10 w-full rounded-[6px] border border-[var(--shell-border)] bg-[var(--shell-panel)] px-3 text-sm text-fg outline-none focus:border-[var(--shell-focus)] focus:ring-1 focus:ring-[var(--shell-focus)] disabled:cursor-not-allowed disabled:opacity-50",
          triggerClassName,
          className,
        )}
      >
        {allowEmpty && <option value="">{emptyLabel ?? placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  const selectValue = value === "" ? (allowEmpty ? EMPTY_VALUE : undefined) : value;

  return (
    <Select
      value={selectValue}
      onValueChange={(next) => onChange(next === EMPTY_VALUE ? "" : next)}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        size={size}
        className={cn("w-full", triggerClassName, className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowEmpty && (
          <SelectItem value={EMPTY_VALUE}>{emptyLabel ?? placeholder}</SelectItem>
        )}
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
