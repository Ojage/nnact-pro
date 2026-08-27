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
        "relative flex size-28 sm:size-32 items-center justify-center rounded-lg border-2 border-input bg-background p-2 sm:p-3 text-3xl sm:text-4xl font-semibold text-foreground shadow-sm shadow-black/5 transition-shadow",
        props.isActive && "z-10 border-2 border-ring ring-4 ring-ring/20",
      )}
    >
      {props.char !== null ? <span className="tabular-nums">{props.char}</span> : null}
      {props.hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-2 sm:p-3">
          <div className="animate-caret-blink h-12 w-1 sm:h-14 sm:w-1.5 rounded-full bg-primary opacity-90" />
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
        <div className="flex">
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
        "flex items-center gap-2 has-disabled:opacity-50",
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
      className={cn("flex items-center gap-1", className)}
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
        "data-[active=true]:border-ring data-[active=true]:ring-ring/50 data-[active=true]:aria-invalid:ring-destructive/20 dark:data-[active=true]:aria-invalid:ring-destructive/40 aria-invalid:border-destructive data-[active=true]:aria-invalid:border-destructive dark:bg-input/30 border-input relative flex h-9 w-9 items-center justify-center border-y border-r text-sm bg-input-background transition-all outline-none first:rounded-l-md first:border-l last:rounded-r-md data-[active=true]:z-10 data-[active=true]:ring-[3px]",
        className,
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="animate-caret-blink bg-primary h-5 w-[2.5px] rounded-full shadow-[0_0_8px_var(--primary)] opacity-80" />
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
