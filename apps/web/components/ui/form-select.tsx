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
}: FormSelectProps) {
  const selectValue = value === "" ? (allowEmpty ? EMPTY_VALUE : undefined) : value;

  return (
    <Select
      value={selectValue}
      onValueChange={(next) => onChange(next === EMPTY_VALUE ? "" : next)}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
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
