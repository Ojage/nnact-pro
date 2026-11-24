"use client";

import { useRef, useState } from "react";
import { buildWhatsAppUrl, NNACT_COMPANY } from "@nnact/shared";
import { welcomeServices } from "../app/content";
import { cn } from "@/lib/utils";

type BookVisitButtonProps = {
  label?: string;
  service?: string;
  variant?: "primary" | "quiet" | "light";
  className?: string;
};

export function BookVisitButton({
  label = "Book a visit",
  service,
  variant = "primary",
  className,
}: BookVisitButtonProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(0);
  const [selectedService, setSelectedService] = useState(service ?? welcomeServices[0].title);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [details, setDetails] = useState("");

  function openDialog() {
    if (service) setSelectedService(service);
    setStep(0);
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  function submitBooking() {
    const message = [
      "Hello NNACT, I would like to book a visit.",
      `Service: ${selectedService}`,
      `Name: ${name}`,
      `Phone: ${phone}`,
      `Location: ${location}`,
      details.trim() ? `Issue: ${details.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    window.open(buildWhatsAppUrl(NNACT_COMPANY.contact.phones[0], message), "_blank", "noopener,noreferrer");
    closeDialog();
  }

  const canContinue = name.trim().length > 1 && phone.trim().length > 4 && location.trim().length > 1;

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-full font-bold transition-transform duration-200 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-4",
          variant === "primary" &&
            "bg-[#ffd400] px-6 py-3 text-sm text-[#141414] outline-[#ffd400] hover:bg-[#ffdf45]",
          variant === "light" &&
            "border border-white/30 bg-white/10 px-6 py-3 text-sm text-white outline-white hover:bg-white/20",
          variant === "quiet" &&
            "border border-[#141414]/15 px-4 py-2 text-xs text-[#141414] outline-[#141414] hover:border-[#141414]/40 dark:border-white/20 dark:text-white dark:outline-white",
          className,
        )}
      >
        {label}
        <span aria-hidden="true">→</span>
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="book-visit-title"
        className="landing-dialog w-[min(560px,calc(100%-24px))] rounded-[28px] border border-black/10 bg-[#fbfaf8] p-0 text-[#141414] shadow-2xl dark:border-white/10 dark:bg-[#111111] dark:text-white"
        onClick={(event) => {
          if (event.target === dialogRef.current) closeDialog();
        }}
        onClose={() => setStep(0)}
      >
        <div className="p-6 sm:p-8">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8a6a00] dark:text-[#ffd400]">
                NNACT services · Buea
              </p>
              <h2 id="book-visit-title" className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
                Book a visit
              </h2>
            </div>
            <button
              type="button"
              onClick={closeDialog}
              aria-label="Close booking form"
              className="rounded-full border border-black/10 px-3 py-1 text-sm font-bold transition hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              ✕
            </button>
          </div>

          <p aria-live="polite" className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-[#6b6b6b] dark:text-white/60">
            Step {step + 1} of 3
          </p>

          <div className="mt-5 min-h-[240px]">
            {step === 0 ? (
              <div>
                <p className="text-lg font-bold">What do you need help with?</p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {welcomeServices.map((item) => (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => setSelectedService(item.title)}
                      aria-pressed={selectedService === item.title}
                      className={cn(
                        "rounded-2xl border px-4 py-3 text-left text-sm font-bold transition",
                        selectedService === item.title
                          ? "border-[#ffd400] bg-[#ffd400]/20"
                          : "border-black/10 hover:border-black/30 dark:border-white/15 dark:hover:border-white/40",
                      )}
                    >
                      {item.title}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {step === 1 ? (
              <div className="grid gap-4">
                <p className="text-lg font-bold">Where should the technician come?</p>
                <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-[#6b6b6b] dark:text-white/60">
                  Your name
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-[#141414] dark:border-white/15 dark:bg-white/5 dark:text-white"
                  />
                </label>
                <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-[#6b6b6b] dark:text-white/60">
                  Phone number
                  <input
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    autoComplete="tel"
                    inputMode="tel"
                    className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-[#141414] dark:border-white/15 dark:bg-white/5 dark:text-white"
                  />
                </label>
                <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-[#6b6b6b] dark:text-white/60">
                  Address or area
                  <input
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                    autoComplete="street-address"
                    className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-[#141414] dark:border-white/15 dark:bg-white/5 dark:text-white"
                  />
                </label>
                <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-[#6b6b6b] dark:text-white/60">
                  What is happening? <span className="normal-case">(optional)</span>
                  <textarea
                    value={details}
                    onChange={(event) => setDetails(event.target.value)}
                    rows={3}
                    className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-[#141414] dark:border-white/15 dark:bg-white/5 dark:text-white"
                  />
                </label>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="grid gap-4">
                <p className="text-lg font-bold">Confirm and send</p>
                <dl className="grid gap-2 rounded-2xl border border-black/10 bg-white p-4 text-sm dark:border-white/15 dark:bg-white/5">
                  <div className="flex justify-between gap-4">
                    <dt className="text-[#6b6b6b] dark:text-white/60">Service</dt>
                    <dd className="text-right font-bold">{selectedService}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-[#6b6b6b] dark:text-white/60">Name</dt>
                    <dd className="text-right font-bold">{name}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-[#6b6b6b] dark:text-white/60">Phone</dt>
                    <dd className="text-right font-bold">{phone}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-[#6b6b6b] dark:text-white/60">Location</dt>
                    <dd className="text-right font-bold">{location}</dd>
                  </div>
                </dl>
                <p className="text-sm leading-6 text-[#6b6b6b] dark:text-white/60">
                  This opens WhatsApp with your booking details ready to send to NNACT.
                </p>
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => (step === 0 ? closeDialog() : setStep((value) => value - 1))}
              className="rounded-full px-4 py-2 text-sm font-bold text-[#6b6b6b] transition hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
            >
              {step === 0 ? "Cancel" : "Back"}
            </button>
            {step < 2 ? (
              <button
                type="button"
                onClick={() => setStep((value) => value + 1)}
                disabled={step === 1 && !canContinue}
                className="rounded-full bg-[#141414] px-6 py-3 text-sm font-bold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#ffd400] dark:text-[#141414]"
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={submitBooking}
                className="rounded-full bg-[#ffd400] px-6 py-3 text-sm font-bold text-[#141414] transition active:scale-[0.98]"
              >
                Send on WhatsApp
              </button>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
