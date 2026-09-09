"use client";

import { useEffect, useState } from "react";
import { CircleAlert, CheckCircle2 } from "lucide-react";
import { api, type SmsSettingsDTO, type SmsSettingsRow } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { InfoTip } from "@/components/ui/info-tip";
import { Skeleton } from "@/components/ui/skeleton";

interface FormState {
  baseUrl: string;
  legacyBaseUrl: string;
  username: string;
  password: string;
  apiKey: string;
  senderId: string;
  isActive: boolean;
}

function fieldLabel(label: string, tip?: string) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      {tip ? <InfoTip>{tip}</InfoTip> : null}
    </span>
  );
}

const blankForm: FormState = {
  baseUrl: "",
  legacyBaseUrl: "",
  username: "",
  password: "",
  apiKey: "",
  senderId: "",
  isActive: true,
};

export function SmsSettingsEditor() {
  const [row, setRow] = useState<SmsSettingsRow | null>(null);
  const [form, setForm] = useState<FormState>(blankForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .smsSettings()
      .then((dto: SmsSettingsDTO) => {
        if (cancelled) return;
        const current = dto.settings[0] ?? null;
        setRow(current);
        setForm(current ? currentToForm(current) : blankForm);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Could not load SMS settings.";
        setError(message.includes("403") ? "Only owners can manage SMS settings." : message);
        setForm(blankForm);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function currentToForm(current: SmsSettingsRow | null): FormState {
    return {
      baseUrl: current?.baseUrl ?? "",
      legacyBaseUrl: current?.legacyBaseUrl ?? "",
      username: current?.username ?? "",
      password: "",
      apiKey: "",
      senderId: current?.senderId ?? "",
      isActive: current?.isActive ?? true,
    };
  }

  const updateForm = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : { ...blankForm, [key]: value }));
  };

  async function save() {
    if (!form) return;
    setSaving(true);
    setStatus(null);
    setError(null);
    const payload: Record<string, unknown> = {
      name: row?.name ?? "default",
      baseUrl: form.baseUrl.trim() || undefined,
      legacyBaseUrl: form.legacyBaseUrl.trim() || undefined,
      username: form.username.trim() || null,
      senderId: form.senderId.trim() || null,
      isActive: form.isActive,
    };
    if (form.password.trim()) payload.password = form.password.trim();
    if (form.apiKey.trim()) payload.apiKey = form.apiKey.trim();
    try {
      await api.saveSmsSettings(payload);
      const dto = await api.smsSettings();
      setRow(dto.settings[0] ?? null);
      setForm(currentToForm(dto.settings[0] ?? null));
      setStatus("Saved. SMS will use these provider credentials on the next message.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save SMS settings.");
    } finally {
      setSaving(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    setStatus(null);
    setError(null);
    try {
      const result = await api.refreshEtechKeys();
      setStatus(
        result.configured
          ? "Provider session refreshed and SMS is configured."
          : "Session reset. SMS is not fully configured yet — verify the credentials below.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not refresh the provider session.");
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>SMS Provider — EtechKeys</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </Card>
    );
  }

  const configured = Boolean(form && (form.username.trim() || form.apiKey.trim() || (row?.usernameMasked ?? null)));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          SMS Provider — EtechKeys
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              configured ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-400/15 text-amber-600"
            }`}
          >
            {configured ? "Configured" : "Not configured"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-fg-muted">
          OTP sign-in codes are delivered through EtechKeys SMS. Add your provider account details below; credentials live
          here and in the server environment only.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="sms-base-url">
              {fieldLabel("Base URL", "Primary API endpoint of your EtechKeys account.")}
            </Label>
            <Input
              id="sms-base-url"
              type="url"
              value={form?.baseUrl ?? ""}
              onChange={(event) => updateForm("baseUrl", event.target.value)}
              placeholder="https://api.etechkeys.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sms-legacy-base-url">
              {fieldLabel("Legacy base URL", "Fallback API endpoint used for legacy key delivery.")}
            </Label>
            <Input
              id="sms-legacy-base-url"
              type="url"
              value={form?.legacyBaseUrl ?? ""}
              onChange={(event) => updateForm("legacyBaseUrl", event.target.value)}
              placeholder="https://legacy.etechkeys.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sms-username">{fieldLabel("Username", "EtechKeys account login.")}</Label>
            <Input
              id="sms-username"
              autoComplete="off"
              value={form?.username ?? ""}
              onChange={(event) => updateForm("username", event.target.value)}
              placeholder="account@etechkeys.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sms-password">{fieldLabel("Password", "Leave blank to keep the current password.")}</Label>
            <PasswordInput
              id="sms-password"
              autoComplete="new-password"
              value={form?.password ?? ""}
              onChange={(event) => updateForm("password", event.target.value)}
              placeholder={row?.passwordMasked ? `Current: ${row.passwordMasked}` : "Set a new password"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sms-api-key">{fieldLabel("API key", "Leave blank to keep the current key.")}</Label>
            <PasswordInput
              id="sms-api-key"
              autoComplete="new-password"
              value={form?.apiKey ?? ""}
              onChange={(event) => updateForm("apiKey", event.target.value)}
              placeholder={row?.apiKeyMasked ? `Current: ${row.apiKeyMasked}` : "Set a new API key"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sms-sender-id">{fieldLabel("Sender ID", "Shown as the sender on delivered SMS.")}</Label>
            <Input
              id="sms-sender-id"
              value={form?.senderId ?? ""}
              onChange={(event) => updateForm("senderId", event.target.value)}
              placeholder="NNACT"
            />
          </div>
        </div>

        <label className="flex items-center gap-3 rounded-lg border border-border bg-surface-200 px-3 py-2.5 text-sm">
          <Switch
            checked={form?.isActive ?? true}
            onCheckedChange={(checked) => updateForm("isActive", Boolean(checked))}
            aria-label="Active"
          />
          <span>
            Active
            <span className="ml-1 text-xs text-fg-muted">use this provider for OTP codes</span>
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button onClick={() => void save()} disabled={!form || saving} loading={saving}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
          <Button variant="outline" onClick={() => void refresh()} disabled={refreshing} loading={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh session token"}
          </Button>
        </div>

        {status ? (
          <p className="flex items-center gap-1.5 text-sm text-emerald-600">
            <CheckCircle2 className="size-4" /> {status}
          </p>
        ) : null}
        {error ? (
          <p className="flex items-center gap-1.5 text-sm text-destructive">
            <CircleAlert className="size-4" /> {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}