"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { login, loginWithPhone, requestOtp, verifyOtp } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { BrandMark } from "@/components/brand-mark";
import {
  NNACT_COMPANY,
  cameroonCarrierLabel,
  isValidCameroonMobile,
  normalizePhone,
} from "@nnact/shared";

type LoginMode = "password" | "otp";
type OtpStage = "phone" | "code";

const OTP_DIGITS = 6;
const RESEND_COOLDOWN_SECONDS = 60;

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>("password");
  const [otpStage, setOtpStage] = useState<OtpStage>("phone");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [requestedPhone, setRequestedPhone] = useState("");
  const [password, setPassword] = useState("");
  const [digits, setDigits] = useState<string[]>(() => Array(OTP_DIGITS).fill(""));
  const [submitting, setSubmitting] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  const isPhoneValid = isValidCameroonMobile(phone);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [resendIn > 0]);

  function reportError(err: unknown) {
    const message = err instanceof Error ? err.message : "Sign-in failed";
    if (message.includes("401") || message.toLowerCase().includes("invalid credentials")) {
      setError("The email, phone, or code you entered doesn't match our records. Check your details and try again.");
    } else if (
      message.toLowerCase().includes("failed to fetch") ||
      message.toLowerCase().includes("network") ||
      message.includes("ECONNREFUSED")
    ) {
      setError("We couldn't reach the server. Check your connection and try again.");
    } else {
      setError("Something went wrong. Please try again.");
    }
  }

  async function onSendCode() {
    if (!isPhoneValid) {
      setError("Enter a valid MTN, Orange, or Camtel number.");
      return;
    }
    setError(null);
    setSendingCode(true);
    try {
      const target = normalizePhone(phone);
      const result = await requestOtp(target);
      if (!result.sent) {
        setError("Could not send a code right now. Try again in a minute.");
        return;
      }
      setRequestedPhone(target);
      setDigits(Array(OTP_DIGITS).fill(""));
      setOtpStage("code");
      setResendIn(RESEND_COOLDOWN_SECONDS);
      setTimeout(() => otpRefs.current[0]?.focus(), 150);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send a code.");
    } finally {
      setSendingCode(false);
    }
  }

  function handleOtpChange(index: number, text: string) {
    const cleaned = text.replace(/\D+/g, "");
    if (!cleaned) {
      setDigits((d) => {
        const next = [...d];
        next[index] = "";
        return next;
      });
      if (index > 0) otpRefs.current[index - 1]?.focus();
      return;
    }
    const next = [...digits];
    let caret = index;
    for (const char of cleaned) {
      if (caret >= OTP_DIGITS) break;
      next[caret] = char;
      caret += 1;
    }
    setDigits(next);
    if (cleaned.length > 1 || caret < OTP_DIGITS) {
      otpRefs.current[Math.min(caret, OTP_DIGITS - 1)]?.focus();
    } else {
      void verifyOtpCode(next.join(""));
    }
  }

  async function verifyOtpCode(code: string) {
    if (verifying || code.length !== OTP_DIGITS) return;
    setVerifying(true);
    setError(null);
    try {
      await verifyOtp(requestedPhone, code);
      router.replace("/");
      router.refresh();
    } catch (err) {
      reportError(err);
      setDigits(Array(OTP_DIGITS).fill(""));
      otpRefs.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  }

  function resetOtp() {
    setDigits(Array(OTP_DIGITS).fill(""));
    setOtpStage("phone");
    setRequestedPhone("");
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (email.includes("@")) {
        await login(email.trim(), password);
      } else {
        await loginWithPhone(email.trim(), password);
      }
      router.replace("/");
      router.refresh();
    } catch (err) {
      reportError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-100 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <BrandMark size="lg" showSubtitle={false} className="mb-2" />
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            Access the {NNACT_COMPANY.shortName} technical operations workspace — HVAC, refrigeration, energy, and field maintenance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex gap-2 rounded-lg bg-surface-200 p-1 text-sm">
            {(["password", "otp"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setMode(tab);
                  setError(null);
                  if (tab === "otp") setOtpStage("phone");
                }}
                className={
                  mode === tab
                    ? "flex-1 rounded-md bg-surface-50 px-3 py-1.5 font-medium text-fg shadow-sm"
                    : "flex-1 rounded-md px-3 py-1.5 text-fg-muted hover:text-fg"
                }
              >
                {tab === "password" ? "Password" : "Code (OTP)"}
              </button>
            ))}
          </div>
          {mode === "password" ? (
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="login-email" className="text-xs text-fg-muted">
                  Email or phone
                </Label>
                <Input
                  id="login-email"
                  type="text"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com or 6XX XX XX XX"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password" className="text-xs text-fg-muted">
                  Password
                </Label>
                <PasswordInput
                  id="login-password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password"
                  required
                />
                <div className="flex justify-end">
                  <Link href="/forgot-password" className="text-xs font-medium text-fg-muted hover:text-fg">
                    Forgot password?
                  </Link>
                </div>
              </div>
              <Button type="submit" className="w-full" loading={submitting}>
                Sign in
              </Button>
            </form>
          ) : otpStage === "phone" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="otp-phone" className="text-xs text-fg-muted">
                  Phone number
                </Label>
                <Input
                  id="otp-phone"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="6XX XX XX XX"
                />
                <p className="text-xs text-fg-muted">
                  {phone.trim()
                    ? isPhoneValid
                      ? `${cameroonCarrierLabel(phone)} · we'll text you a 6-digit code`
                      : "Enter a valid MTN, Orange, or Camtel number."
                    : "We'll text you a 6-digit sign-in code."}
                </p>
              </div>
              <Button
                type="button"
                className="w-full"
                onClick={() => void onSendCode()}
                disabled={!isPhoneValid}
                loading={sendingCode}
              >
                {sendingCode ? "Requesting…" : "Request Short Code"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-fg">Enter the 6-digit code</p>
                <p className="text-xs text-fg-muted">
                  Sent to {requestedPhone}
                </p>
              </div>
              <div className="flex justify-between gap-2">
                {digits.map((digit, index) => (
                  <Input
                    key={index}
                    ref={(el) => {
                      otpRefs.current[index] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={digit}
                    onChange={(event) => handleOtpChange(index, event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Backspace" && !digit && index > 0) {
                        otpRefs.current[index - 1]?.focus();
                      }
                    }}
                    onFocus={(event) => event.target.select()}
                    disabled={verifying}
                    maxLength={6}
                    className="h-14 w-12 px-0 text-center text-lg font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    aria-label={`Digit ${index + 1} of ${OTP_DIGITS}`}
                  />
                ))}
              </div>
              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={resetOtp}
                  className="font-medium text-fg-muted hover:text-fg"
                >
                  Change number
                </button>
                <button
                  type="button"
                  onClick={() => void onSendCode()}
                  disabled={resendIn > 0 || sendingCode}
                  className="font-medium text-fg hover:text-fg disabled:cursor-not-allowed disabled:text-fg-muted"
                >
                  {resendIn > 0 ? `Resend code in ${resendIn}s` : sendingCode ? "Sending…" : "Resend code"}
                </button>
              </div>
              {verifying ? <p className="text-xs text-fg-muted">Signing you in…</p> : null}
            </div>
          )}
          {error && (
            <div className="mt-4">
              <Alert variant="destructive">
                <AlertCircle />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}