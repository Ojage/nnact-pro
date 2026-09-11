"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { requestPasswordReset, resetPassword } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { BrandMark } from "@/components/brand-mark";
import { NNACT_COMPANY } from "@nnact/shared";

const OTP_DIGITS = 6;

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [sent, setSent] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [devCode, setDevCode] = useState<string | null>(null);
  const otpRef = useRef<HTMLInputElement | null>(null);

  const looksLikeEmail = useMemo(() => /@/.test(identifier.trim()), [identifier]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  async function onRequestCode() {
    const value = identifier.trim();
    if (!value) {
      setError("Enter the email or phone number on your account.");
      return;
    }
    setError(null);
    setRequesting(true);
    try {
      const result = await requestPasswordReset(looksLikeEmail ? { email: value } : { phone: value });
      if (result.devCode) setDevCode(result.devCode);
      setSent(true);
      setResendIn(60);
      setCode("");
      setTimeout(() => otpRef.current?.focus(), 150);
    } catch (err) {
      reportError(err);
    } finally {
      setRequesting(false);
    }
  }

  async function onResetPassword(event: React.FormEvent) {
    event.preventDefault();
    if (code.trim().length !== OTP_DIGITS) {
      setError("Enter the 6-digit code.");
      return;
    }
    setError(null);
    setResetting(true);
    try {
      await resetPassword(looksLikeEmail ? { email: identifier.trim(), code: code.trim(), newPassword } : { phone: identifier.trim(), code: code.trim(), newPassword });
      router.replace("/login");
      router.refresh();
    } catch (err) {
      reportError(err);
    } finally {
      setResetting(false);
    }
  }

  function reportError(err: unknown) {
    const message = err instanceof Error ? err.message : "Something went wrong. Try again.";
    if (message.includes("failed to fetch") || message.toLowerCase().includes("network") || message.includes("ECONNREFUSED")) {
      setError(`Cannot reach the API (${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3003"}). Start it with: pnpm dev:api`);
    } else {
      setError(message);
    }
  }

  function changeIdentifier() {
    setSent(false);
    setDevCode(null);
    setError(null);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-100 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <BrandMark size="lg" showSubtitle={false} className="mb-2" />
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>
            Enter the email or phone number linked to your {NNACT_COMPANY.shortName} account and we&apos;ll send a one-time code.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!sent ? (
            <form onSubmit={onRequestCode} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="reset-identifier" className="text-xs text-fg-muted">
                  Email or phone
                </Label>
                <Input
                  id="reset-identifier"
                  type="text"
                  autoComplete="username"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder="you@example.com or 6XX XX XX XX"
                  required
                />
                <p className="text-xs text-fg-muted">
                  We&apos;ll send a code by email or SMS — whichever matches what you enter.
                </p>
              </div>
              <Button type="submit" className="w-full" loading={requesting}>
                {requesting ? "Sending code…" : "Send code"}
              </Button>
              <p className="text-center text-sm">
                <Link href="/login" className="font-medium text-fg hover:underline">
                  Back to sign in
                </Link>
              </p>
            </form>
          ) : (
            <form onSubmit={onResetPassword} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="reset-code" className="text-xs text-fg-muted">
                  Verification code
                </Label>
                <Input
                  ref={otpRef}
                  id="reset-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D+/g, "").slice(0, OTP_DIGITS))}
                  placeholder="000000"
                  disabled={resetting}
                  required
                />
                {devCode ? (
                  <p className="text-xs text-emerald-600">
                    Dev code: {devCode} (delivery not configured)
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="reset-password" className="text-xs text-fg-muted">
                  New password
                </Label>
                <PasswordInput
                  id="reset-password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="At least 12 characters"
                  required
                />
              </div>
              <Button type="submit" className="w-full" loading={resetting}>
                {resetting ? "Resetting…" : "Reset password"}
              </Button>
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={changeIdentifier}
                  disabled={resetting}
                  className="font-medium text-fg-muted hover:text-fg disabled:opacity-50"
                >
                  Change email / phone
                </button>
                <button
                  type="button"
                  onClick={() => void onRequestCode()}
                  disabled={resendIn > 0 || requesting}
                  className="font-medium text-fg hover:text-fg disabled:text-fg-muted"
                >
                  {resendIn > 0 ? `Resend code in ${resendIn}s` : requesting ? "Sending…" : "Resend code"}
                </button>
              </div>
            </form>
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
