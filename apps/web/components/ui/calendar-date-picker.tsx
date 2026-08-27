"use client";

import * as React from "react";
import { useTranslation } from "react-i18next";
import { Label } from "./label";
import { Input } from "./input";

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

interface CalendarDatePickerProps {
  label?: string;
  id?: string;
  value?: string; // YYYY-MM-DD format
  onChange?: (value: string) => void;
  placeholder?: string;
  minDate?: Date;
  maxDate?: Date;
  disabled?: boolean;
  required?: boolean;
}

export function CalendarDatePicker({
  label,
  id,
  value = "",
  onChange,
  placeholder,
  minDate,
  maxDate,
  disabled = false,
  required = false,
}: CalendarDatePickerProps) {
  const { t } = useTranslation();

  const sanitizedValue = React.useMemo(() => {
    if (!value) return "";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "" : toIsoDate(parsed);
  }, [value]);

  return (
    <div className="flex flex-col gap-2">
      {label && (
        <Label htmlFor={id} className="px-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </Label>
      )}
      <Input
        id={id}
        type="date"
        value={sanitizedValue}
        min={minDate ? toIsoDate(minDate) : undefined}
        max={maxDate ? toIsoDate(maxDate) : undefined}
        aria-label={label || t("datePicker.placeholder", "Pick a date")}
        placeholder={placeholder || t("datePicker.placeholder", "Pick a date")}
        disabled={disabled}
        required={required}
        className="h-10 font-normal text-sm"
        onChange={(event) => {
          const next = event.target.value;
          onChange?.(next);
        }}
      />
    </div>
  );
}
