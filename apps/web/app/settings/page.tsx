"use client";

import { useEffect, useState } from "react";
import { api, type OrgSettingsDTO } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

type Tab = "team" | "general";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("team");

  return (
    <div>
      <PageHeader title="Settings" description="Manage your team, organization, and document branding" />

      <div className="flex gap-1 mb-6 bg-surface-200 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab("team")}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer border-none ${
            tab === "team" ? "bg-accent text-surface-100" : "text-fg-muted hover:text-fg"
          }`}
        >
          Team
        </button>
        <button
          onClick={() => setTab("general")}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer border-none ${
            tab === "general" ? "bg-accent text-surface-100" : "text-fg-muted hover:text-fg"
          }`}
        >
          General & Branding
        </button>
      </div>

      {tab === "team" && <TeamTab />}
      {tab === "general" && <GeneralTab />}
    </div>
  );
}

function TeamTab() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const u = await api.users();
        if (!cancelled) setUsers(u);
      } catch {
        if (!cancelled) setError("Failed to load users");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const handleRoleChange = async (id: string, role: string) => {
    setSavingId(id);
    try {
      await api.patchUser(id, { role });
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
    } catch { /* silent */ }
    setSavingId(null);
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch { /* silent */ }
    setConfirmDelete(null);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red/30 bg-red/5">
        <CardContent className="p-4">
          <p className="text-sm text-red">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium text-fg">{u.name}</TableCell>
                <TableCell className="text-fg-muted">{u.email}</TableCell>
                <TableCell>
                  <select
                    value={u.role}
                    onChange={(e) => handleRoleChange(u.id, e.target.value)}
                    disabled={savingId === u.id}
                    style={{ colorScheme: "dark" }}
                    className="h-8 rounded-md border border-border bg-surface-300 px-2 text-xs text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 cursor-pointer disabled:opacity-50"
                  >
                    <option value="owner">Owner</option>
                    <option value="dispatcher">Dispatcher</option>
                    <option value="technician">Technician</option>
                  </select>
                </TableCell>
                <TableCell>
                  {confirmDelete === u.id ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleDelete(u.id)}
                        className="text-xs text-red hover:text-red/80 transition-colors cursor-pointer bg-transparent border-none"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="text-xs text-fg-muted hover:text-fg transition-colors cursor-pointer bg-transparent border-none"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(u.id)}
                      className="text-xs text-fg-muted hover:text-red transition-colors cursor-pointer bg-transparent border-none"
                    >
                      Delete
                    </button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {users.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm text-fg-muted">No users found.</p>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function GeneralTab() {
  const [org, setOrg] = useState<OrgSettingsDTO | null>(null);
  const [form, setForm] = useState<Partial<OrgSettingsDTO>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.org()
      .then((row) => {
        if (cancelled) return;
        setOrg(row);
        setForm(row);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load organization info");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const setField = <K extends keyof OrgSettingsDTO>(key: K, value: OrgSettingsDTO[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const row = await api.patchOrg({
        name: form.name,
        timezone: form.timezone,
        logoUrl: form.logoUrl || null,
        brandColor: form.brandColor || "#22C55E",
        documentFooter: form.documentFooter || null,
        publicEmail: form.publicEmail || null,
        publicPhone: form.publicPhone || null,
        publicAddress: form.publicAddress || null,
        removeOpenFieldProAttribution: !!form.removeOpenFieldProAttribution,
      });
      setOrg(row);
      setForm(row);
      setMessage("Organization branding saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save organization settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle>Organization</CardTitle></CardHeader>
        <CardContent>
          <Skeleton className="h-5 w-48" />
        </CardContent>
      </Card>
    );
  }

  if (!org) {
    return (
      <Card className="border-red/30 bg-red/5">
        <CardContent className="p-4">
          <p className="text-sm text-red">{error ?? "Could not load organization info."}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Organization & document branding</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="grid gap-1.5 text-sm text-fg-muted">
              Company name
              <Input value={form.name ?? ""} onChange={(e) => setField("name", e.target.value)} />
            </label>
            <label className="grid gap-1.5 text-sm text-fg-muted">
              Timezone
              <Input value={form.timezone ?? ""} onChange={(e) => setField("timezone", e.target.value)} />
            </label>
            <label className="grid gap-1.5 text-sm text-fg-muted">
              Brand color
              <div className="flex gap-2">
                <Input value={form.brandColor ?? "#22C55E"} onChange={(e) => setField("brandColor", e.target.value)} />
                <input
                  aria-label="Brand color picker"
                  type="color"
                  value={form.brandColor ?? "#22C55E"}
                  onChange={(e) => setField("brandColor", e.target.value)}
                  className="h-10 w-14 rounded-lg border border-border bg-surface-200 p-1"
                />
              </div>
            </label>
            <label className="grid gap-1.5 text-sm text-fg-muted">
              Logo URL
              <Input value={form.logoUrl ?? ""} onChange={(e) => setField("logoUrl", e.target.value || null)} placeholder="https://..." />
            </label>
            <label className="grid gap-1.5 text-sm text-fg-muted">
              Public email
              <Input value={form.publicEmail ?? ""} onChange={(e) => setField("publicEmail", e.target.value || null)} />
            </label>
            <label className="grid gap-1.5 text-sm text-fg-muted">
              Public phone
              <Input value={form.publicPhone ?? ""} onChange={(e) => setField("publicPhone", e.target.value || null)} />
            </label>
            <label className="grid gap-1.5 text-sm text-fg-muted md:col-span-2">
              Public address
              <Input value={form.publicAddress ?? ""} onChange={(e) => setField("publicAddress", e.target.value || null)} />
            </label>
            <label className="grid gap-1.5 text-sm text-fg-muted md:col-span-2">
              Document footer
              <Input value={form.documentFooter ?? ""} onChange={(e) => setField("documentFooter", e.target.value || null)} placeholder="Licensed, insured, locally owned..." />
            </label>
            <label className="flex items-center gap-2 text-sm text-fg-muted md:col-span-2">
              <input
                type="checkbox"
                checked={!!form.removeOpenFieldProAttribution}
                onChange={(e) => setField("removeOpenFieldProAttribution", e.target.checked)}
              />
              Remove OpenFieldPro attribution on customer-facing documents
            </label>
          </div>

          {(message || error) && (
            <p className={`mt-4 text-sm ${error ? "text-red" : "text-green"}`}>{error ?? message}</p>
          )}

          <div className="mt-6 flex gap-2">
            <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save branding"}</Button>
            <Button variant="secondary" onClick={() => setForm(org)} disabled={saving}>Reset</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Document preview style</CardTitle></CardHeader>
        <CardContent>
          <div className="rounded-2xl border border-border bg-surface-200 p-5">
            <div className="flex items-center gap-3 border-b border-border pb-4">
              <div className="h-10 w-10 rounded-xl" style={{ background: form.brandColor ?? "#22C55E" }} />
              <div>
                <p className="text-sm font-bold text-fg">{form.name ?? org.name}</p>
                <p className="text-xs text-fg-muted">Customer document header</p>
              </div>
            </div>
            <div className="mt-4 grid gap-2 text-xs text-fg-muted">
              <p>Email: {form.publicEmail || "—"}</p>
              <p>Phone: {form.publicPhone || "—"}</p>
              <p>Address: {form.publicAddress || "—"}</p>
              <p>Footer: {form.documentFooter || "Field service command center document"}</p>
              <p>Attribution: {form.removeOpenFieldProAttribution ? "Hidden" : "Powered by OpenFieldPro"}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
