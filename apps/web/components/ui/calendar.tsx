"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "./utils";
import { buttonVariants } from "./button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("rounded-[20px] border border-border bg-card p-4 text-fg shadow-[0_18px_50px_rgba(0,0,0,0.16)]", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium text-fg",
        caption_dropdowns: "flex justify-center gap-1",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-10 w-10 rounded-xl bg-transparent p-0 text-fg-muted hover:bg-accent-muted hover:text-fg"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell:
          "w-10 rounded-xl font-normal text-[0.8rem] text-fg-muted",
        row: "flex w-full mt-2",
        cell: "relative h-10 w-10 p-0 text-center text-sm [&:has([aria-selected].day-range-end)]:rounded-r-xl [&:has([aria-selected].day-outside)]:bg-accent-muted/50 [&:has([aria-selected])]:bg-accent-muted first:[&:has([aria-selected])]:rounded-l-xl last:[&:has([aria-selected])]:rounded-r-xl focus-within:relative focus-within:z-20",
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-10 w-10 rounded-xl p-0 font-normal text-fg hover:bg-accent-muted hover:text-fg aria-selected:opacity-100"
        ),
        day_range_end: "day-range-end",
        day_selected:
          "bg-accent text-fg hover:bg-accent-hover hover:text-fg focus:bg-accent focus:text-fg dark:bg-accent-muted dark:hover:bg-accent-muted dark:focus:bg-accent-muted",
        day_today: "bg-accent-muted text-fg",
        day_outside:
          "day-outside text-fg-muted opacity-50 aria-selected:bg-accent-muted/50 aria-selected:text-fg-muted aria-selected:opacity-30",
        day_disabled: "text-fg-muted opacity-50",
        day_range_middle:
          "aria-selected:bg-accent-muted aria-selected:text-fg",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ ...props }) => <ChevronLeft className="h-4 w-4" />,
        IconRight: ({ ...props }) => <ChevronRight className="h-4 w-4" />,
        Dropdown: ({ value, onChange, children, ...props }) => {
          const options = React.Children.toArray(children) as React.ReactElement<
            React.HTMLProps<HTMLOptionElement>
          >[];
          const selected = options.find((child) => child.props.value === value);
          const handleChange = (value: string) => {
            const changeEvent = {
              target: { value },
            } as React.ChangeEvent<HTMLSelectElement>;
            onChange?.(changeEvent);
          };
          return (
            <Select
              value={value?.toString()}
              onValueChange={(value) => {
                handleChange(value);
              }}
            >
              <SelectTrigger className="h-11 rounded-xl pr-2 focus:ring-0">
                <SelectValue>{selected?.props?.children}</SelectValue>
              </SelectTrigger>
              <SelectContent position="popper">
                {options.map((option, id: number) => (
                  <SelectItem
                    key={`${option.props.value}-${id}`}
                    value={option.props.value?.toString() ?? ""}
                  >
                    {option.props.children}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        },
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
