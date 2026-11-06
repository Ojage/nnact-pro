"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PASSWORD_MIN_LENGTH, validatePasswordStrength } from "@nnact/shared";
import { CustomerFooter, CustomerHeader } from "@/components/customer-chrome";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { customerApi } from "@/lib/customer-api";

export default function CustomerSignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const passwordError = validatePasswordStrength(form.password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await customerApi.signup({
        name: form.name,
        email: form.email,
        phone: form.phone.trim() || undefined,
        password: form.password,
      });
      router.push("/account");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create your account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface-100">
      <CustomerHeader compact />
      <main className="mx-auto w-[min(500px,calc(100%-32px))] py-14">
        <Card>
          <CardHeader>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent">Customer account</p>
            <CardTitle className="text-2xl font-black">Create your account</CardTitle>
            <CardDescription>Your service history and documents stay together in one place.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <label className="block text-sm font-semibold text-fg">
                Full name
                <Input className="mt-1" required value={form.name} onChange={(event) => update("name", event.target.value)} />
              </label>
              <label className="block text-sm font-semibold text-fg">
                Email
                <Input className="mt-1" type="email" autoComplete="email" required value={form.email} onChange={(event) => update("email", event.target.value)} />
              </label>
              <label className="block text-sm font-semibold text-fg">
                Phone (optional)
                <Input className="mt-1" type="tel" value={form.phone} onChange={(event) => update("phone", event.target.value)} />
              </label>
              <label className="block text-sm font-semibold text-fg">
                Password
                <Input className="mt-1" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} value={form.password} onChange={(event) => update("password", event.target.value)} />
                <span className="mt-1 block text-xs font-normal text-fg-dim">At least {PASSWORD_MIN_LENGTH} characters with letters and numbers.</span>
              </label>
              {error ? <p className="rounded-lg bg-red/10 px-3 py-2 text-sm text-red">{error}</p> : null}
              <Button className="w-full" size="lg" disabled={busy}>
                {busy ? "Creating account..." : "Create account"}
              </Button>
            </form>
            <p className="mt-5 text-center text-sm text-fg-muted">
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-accent no-underline hover:underline">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </main>
      <CustomerFooter />
    </div>
  );
}
