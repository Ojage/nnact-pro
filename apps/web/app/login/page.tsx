"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { BrandMark } from "@/components/brand-mark";
import { NNACT_COMPANY } from "@nnact/shared";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
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
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="mb-1.5 block text-xs text-fg-muted">Email</label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <div>
              <label htmlFor="login-password" className="mb-1.5 block text-xs text-fg-muted">Password</label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
            {error && (
              <p role="alert" className="rounded-lg border border-red/25 bg-red/5 px-3 py-2 text-sm text-red">
                Sign-in failed. Verify your email and password, then try again.
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
