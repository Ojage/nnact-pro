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
          "mt-1.5 w-full rounded-lg border border-border bg-surface-100 px-2.5 text-xs text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-50",
          size === "sm" ? "py-1.5" : "py-2",
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
