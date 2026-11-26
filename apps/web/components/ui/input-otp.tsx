"use client";

import * as React from "react";
import { OTPInput as OTPInputPrimitive, OTPInputContext } from "input-otp";
import { MinusIcon } from "lucide-react";

import { cn } from "./utils";

/* ----- Render-prop API (demo style): slots + Slot ----- */

export interface SlotProps {
  char: string | null;
  placeholderChar?: string | null;
  isActive: boolean;
  hasFakeCaret: boolean;
}

function Slot(props: SlotProps) {
  return (
    <div
      className={cn(
        "relative flex size-14 min-h-[52px] min-w-[52px] items-center justify-center rounded-xl border border-input bg-input-background p-2 text-2xl font-semibold text-foreground shadow-none transition-[border-color,box-shadow,color,background-color] sm:size-16 sm:text-3xl",
        props.isActive && "z-10 border-accent ring-4 ring-accent/15",
      )}
    >
      {props.char !== null ? <span className="tabular-nums">{props.char}</span> : null}
      {props.hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="animate-caret-blink h-7 w-[2px] rounded-full bg-accent sm:h-8" />
        </div>
      )}
    </div>
  );
}

/** OTP input using render prop + Slot (shadcn/demo style): boxed slots, ring on active. Restricts to 0-9 by default. */
function OTPInputSlots({
  containerClassName,
  maxLength = 6,
  value,
  onChange,
  pattern = "^\\d*$",
  inputMode = "numeric",
  children: _children,
  ...props
}: React.ComponentProps<typeof OTPInputPrimitive> & {
  containerClassName?: string;
}) {
  return (
    <OTPInputPrimitive
      maxLength={maxLength}
      value={value}
      onChange={onChange}
      pattern={pattern}
      inputMode={inputMode}
      containerClassName={cn(
        "flex items-center gap-2 sm:gap-3 has-[:disabled]:opacity-50",
        containerClassName,
      )}
      render={({ slots }) => (
        <div className="flex gap-2 sm:gap-3">
          {slots.map((slot, idx) => (
            <Slot key={idx} {...slot} />
          ))}
        </div>
      )}
      {...props}
    />
  );
}

/* ----- Context-based API (legacy) ----- */

function InputOTP({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<typeof OTPInputPrimitive> & {
  containerClassName?: string;
}) {
  return (
    <OTPInputPrimitive
      data-slot="input-otp"
      containerClassName={cn(
        "flex items-center gap-2.5 has-disabled:opacity-50",
        containerClassName,
      )}
      className={cn("disabled:cursor-not-allowed", className)}
      {...props}
    />
  );
}

function InputOTPGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-otp-group"
      className={cn("flex items-center gap-2", className)}
      {...props}
    />
  );
}

function InputOTPSlot({
  index,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  index: number;
}) {
  const inputOTPContext = React.useContext(OTPInputContext);
  const { char, hasFakeCaret, isActive } = inputOTPContext?.slots[index] ?? {};

  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive}
      className={cn(
        "relative flex h-[52px] w-[52px] items-center justify-center rounded-xl border border-input bg-input-background text-base font-semibold text-foreground shadow-none transition-[border-color,box-shadow,color,background-color] outline-none data-[active=true]:z-10 data-[active=true]:border-accent data-[active=true]:ring-4 data-[active=true]:ring-accent/15 aria-invalid:border-destructive data-[active=true]:aria-invalid:border-destructive data-[active=true]:aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="animate-caret-blink h-6 w-[2px] rounded-full bg-accent" />
        </div>
      )}
    </div>
  );
}

function InputOTPSeparator({ ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="input-otp-separator" role="separator" {...props}>
      <MinusIcon />
    </div>
  );
}

export {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
  OTPInputSlots,
  Slot,
};
