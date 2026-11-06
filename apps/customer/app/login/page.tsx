"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CustomerFooter, CustomerHeader } from "@/components/customer-chrome";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { customerApi } from "@/lib/customer-api";

export default function CustomerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await customerApi.login(email, password);
      router.push("/account");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface-100">
      <CustomerHeader compact />
      <main className="mx-auto w-[min(460px,calc(100%-32px))] py-14">
        <Card>
          <CardHeader>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent">Customer account</p>
            <CardTitle className="text-2xl font-black">Sign in</CardTitle>
            <CardDescription>Track visits, estimates, invoices, equipment and service plans.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <label className="block text-sm font-semibold text-fg">
                Email
                <Input className="mt-1" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
              </label>
              <label className="block text-sm font-semibold text-fg">
                Password
                <Input className="mt-1" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
              </label>
              {error ? <p className="rounded-lg bg-red/10 px-3 py-2 text-sm text-red">{error}</p> : null}
              <Button className="w-full" size="lg" disabled={busy}>
                {busy ? "Signing in..." : "Sign in"}
              </Button>
            </form>
            <p className="mt-5 text-center text-sm text-fg-muted">
              New here?{" "}
              <Link href="/signup" className="font-semibold text-accent no-underline hover:underline">
                Create an account
              </Link>
            </p>
          </CardContent>
        </Card>
      </main>
      <CustomerFooter />
    </div>
  );
}
