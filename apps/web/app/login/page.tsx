"use client";

import { useState } from "react";
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
import { NNACT_COMPANY } from "@nnact/shared";

type LoginMode = "password" | "otp";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>("password");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSendCode() {
    setError(null);
    if (!phone.trim()) {
      setError("Enter your phone number first.");
      return;
    }
    setSendingCode(true);
    try {
      const result = await requestOtp(phone.trim());
      if (result.devCode) setDevCode(result.devCode);
      if (!result.sent) setError("Could not send a code right now. Try again in a minute.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send a code.");
    } finally {
      setSendingCode(false);
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "otp") {
        await verifyOtp(phone.trim(), code.trim());
      } else if (email.includes("@")) {
        await login(email.trim(), password);
      } else {
        await loginWithPhone(email.trim(), password);
      }
      router.replace("/");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign-in failed";
      if (message.includes("401") || message.toLowerCase().includes("invalid credentials")) {
        setError(
          "Invalid credentials or code. If this is a fresh setup, run: pnpm infra:up && pnpm db:push && pnpm seed:nnact",
        );
      } else if (
        message.toLowerCase().includes("failed to fetch") ||
        message.toLowerCase().includes("network") ||
        message.includes("ECONNREFUSED")
      ) {
        setError(
          `Cannot reach the API (${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3003"}). Start it with: pnpm dev:api`,
        );
      } else {
        setError(message);
      }
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
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {mode === "otp" ? (
              <>
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
                    required
                  />
                </div>
                {devCode ? (
                  <p className="text-xs text-emerald-600">
                    Dev code: {devCode} (SMS provider not configured)
                  </p>
                ) : null}
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="otp-code" className="text-xs text-fg-muted">
                      6-digit code
                    </Label>
                    <Input
                      id="otp-code"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      autoComplete="one-time-code"
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      placeholder="123456"
                      required
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void onSendCode()}
                    disabled={sendingCode || !phone.trim()}
                    className="whitespace-nowrap"
                  >
                    {sendingCode ? "Sending…" : "Send code"}
                  </Button>
                </div>
              </>
            ) : (
              <>
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
                </div>
              </>
            )}
            <Button type="submit" className="w-full" loading={submitting}>
              {mode === "otp" ? "Sign in with code" : "Sign in"}
            </Button>
            {error && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertDescription>
                  Sign-in failed. Verify your credentials and try again.
                </AlertDescription>
              </Alert>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}