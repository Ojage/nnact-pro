"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { login } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
      const message = err instanceof Error ? err.message : "Sign-in failed";
      if (message.includes("401") || message.toLowerCase().includes("invalid credentials")) {
        setError(
          "Invalid email or password. If this is a fresh setup, run: pnpm infra:up && pnpm db:push && pnpm seed:nnact",
        );
      } else if (
        message.toLowerCase().includes("failed to fetch") ||
        message.toLowerCase().includes("network") ||
        message.includes("ECONNREFUSED")
      ) {
        setError(
          `Cannot reach the API (${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}). Start it with: pnpm dev:api`,
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
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="login-email" className="text-xs text-fg-muted">
                Email
              </Label>
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
            <Button type="submit" className="w-full" loading={submitting}>
              Sign in
            </Button>
            {error && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertDescription>
                  Sign-in failed. Verify your email and password, then try again.
                </AlertDescription>
              </Alert>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
