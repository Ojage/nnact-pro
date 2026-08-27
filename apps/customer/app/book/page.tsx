"use client";

import { useEffect, useMemo, useState } from "react";
import { NNACT_COMPANY } from "@nnact/shared";
import { api, type PublicBookingConfigDTO } from "@/lib/api";
import { CustomerFooter, CustomerHeader } from "@/components/customer-chrome";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const DEFAULT_ORG_ID = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;

export default function BookPage() {
  const [config, setConfig] = useState<PublicBookingConfigDTO | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [serviceCategory, setServiceCategory] = useState("");
  const [service, setService] = useState("");
  const [address, setAddress] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        setConfig(await api.bookingConfig(DEFAULT_ORG_ID));
      } catch {
        setError("Service booking is temporarily unavailable. Please call us directly.");
      } finally {
        setLoadingConfig(false);
      }
    })();
  }, []);

  const services = useMemo(() => {
    if (!config) return [] as string[];
    const category = config.serviceCategories.find((item) => item.id === serviceCategory);
    return category ? [...category.services] : config.serviceCategories.flatMap((item) => [...item.services]);
  }, [config, serviceCategory]);

  useEffect(() => {
    if (services.length && !services.includes(service)) setService(services[0] ?? "");
  }, [services, service]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!config) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.bookService(config.org.id, {
        name,
        email: email || undefined,
        phone: phone || undefined,
        title: service,
        serviceCategory: config.serviceCategories.find((item) => item.id === serviceCategory)?.label,
        address,
        preferredDate: preferredDate || undefined,
        preferredTime: preferredTime || undefined,
        description: notes || undefined,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^\d+:\s*/, "") : "Unable to submit your request.");
    } finally {
      setSubmitting(false);
    }
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="min-h-screen bg-surface-100 text-fg">
      <CustomerHeader compact />

      <main className="mx-auto w-[min(720px,calc(100%-32px))] py-10">
        <div className="mb-8">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-accent">Service request</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Book {NNACT_COMPANY.shortName} service</h1>
          <p className="mt-2 text-sm text-fg-muted">
            Tell us what you need. Our dispatch team will contact you to confirm timing — usually within 24 hours.
          </p>
        </div>

        {submitted ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-4xl">✓</p>
              <h2 className="mt-4 text-xl font-black">Request received</h2>
              <p className="mt-2 text-sm text-fg-muted">
                Thanks, {name}. We&apos;ll reach out shortly about <strong>{service}</strong>
                {address ? ` at ${address}` : ""}.
              </p>
              <Button className="mt-6" onClick={() => setSubmitted(false)} variant="secondary">
                Submit another request
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-6">
              {loadingConfig ? (
                <p className="py-10 text-center text-sm text-fg-muted">Loading booking form…</p>
              ) : (
                <form onSubmit={(event) => void onSubmit(event)} className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Full name *</span>
                      <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Phone *</span>
                      <Input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+237 …" />
                    </label>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Email</span>
                      <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Service category *</span>
                      <select
                        required
                        value={serviceCategory}
                        onChange={(e) => setServiceCategory(e.target.value)}
                        className="h-10 w-full rounded-lg border border-border bg-surface-50 px-3 text-sm text-fg"
                      >
                        <option value="" disabled>Select a category</option>
                        {config?.serviceCategories.map((category) => (
                          <option key={category.id} value={category.id}>{category.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="block text-sm">
                    <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Service needed *</span>
                    <select
                      required
                      value={service}
                      onChange={(e) => setService(e.target.value)}
                      className="h-10 w-full rounded-lg border border-border bg-surface-50 px-3 text-sm text-fg"
                    >
                      {services.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </label>

                  <label className="block text-sm">
                    <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Service address *</span>
                    <Input required value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, neighborhood, city" />
                  </label>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Preferred date</span>
                      <Input type="date" min={today} value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Preferred time</span>
                      <select
                        value={preferredTime}
                        onChange={(e) => setPreferredTime(e.target.value)}
                        className="h-10 w-full rounded-lg border border-border bg-surface-50 px-3 text-sm text-fg"
                      >
                        <option value="">No preference</option>
                        <option value="morning">Morning</option>
                        <option value="afternoon">Afternoon</option>
                        <option value="evening">Evening</option>
                      </select>
                    </label>
                  </div>

                  <label className="block text-sm">
                    <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Describe the issue</span>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={4}
                      placeholder="What equipment, symptoms, or maintenance do you need?"
                      className="w-full rounded-lg border border-border bg-surface-50 px-3 py-2 text-sm text-fg placeholder:text-fg-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                    />
                  </label>

                  {error ? <p role="alert" className="rounded-lg border border-red/30 bg-red/5 p-3 text-sm text-red">{error}</p> : null}

                  <Button type="submit" size="lg" className="w-full" disabled={submitting || !config}>
                    {submitting ? "Submitting…" : "Submit service request"}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        )}
      </main>

      <CustomerFooter />
    </div>
  );
}
