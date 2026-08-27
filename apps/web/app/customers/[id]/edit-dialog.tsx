"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CustomerDTO } from "@nnact/shared";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function EditCustomerDialog({ customer }: { customer: CustomerDTO }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(customer.name);
  const [email, setEmail] = useState(customer.email ?? "");
  const [phone, setPhone] = useState(customer.phone ?? "");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.patchCustomer(customer.id, {
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
      });
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Edit customer
      </Button>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Close customer editor"
            className="absolute inset-0 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-surface-100 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-fg">Edit customer</h2>
                <p className="mt-1 text-sm text-fg-muted">Update the contact record used by jobs, documents, and follow-up.</p>
              </div>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-fg-muted hover:text-fg" onClick={() => setOpen(false)} aria-label="Close customer editor">
                ✕
              </Button>
            </div>
            <form onSubmit={save} className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Name</span>
                <Input value={name} onChange={(event) => setName(event.target.value)} required />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Email</span>
                <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Phone</span>
                <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
              </label>
              {error && <p className="rounded-lg border border-red/30 bg-red/5 p-3 text-sm text-red">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saving || !name.trim()}>{saving ? "Saving…" : "Save"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
