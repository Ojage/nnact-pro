"use client";

import { useState } from "react";
import {
  useAiSettingsQuery,
  useUpdateAiSettingsMutation,
  useAiProvidersQuery,
  useSaveAiProviderMutation,
  useProbeAiProviderMutation,
  useAiHealthQuery,
  useAiRunsQuery,
  useTriggerAiRunMutation,
  useAiUsageQuery,
} from "@/lib/redux/api";
import { explainRtkError } from "@/lib/redux/api";
import type { AiAutomationSettingsDTO, AiProviderConfigDTO, AiProviderId } from "@nnact/shared";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FormSelect } from "@/components/ui/form-select";

const PROVIDERS: AiProviderId[] = ["OPENAI", "CLAUDE", "GROK"];
const PROVIDER_NAMES: Record<AiProviderId, string> = { OPENAI: "OpenAI", CLAUDE: "Anthropic Claude", GROK: "xAI Grok" };
const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
const STATUS_COLOR: Record<string, string> = {
  CONNECTED: "bg-green/10 text-green",
  DISCONNECTED: "bg-fg-dim/10 text-fg-dim",
  INVALID: "bg-red/10 text-red",
  DEGRADED: "bg-amber/10 text-amber",
};

function todayDouala(): string {
  return new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
}

export default function AiPage() {
  const settingsQ = useAiSettingsQuery();
  const providersQ = useAiProvidersQuery();
  const healthQ = useAiHealthQuery();
  const runsQ = useAiRunsQuery({ take: 12 });
  const usageQ = useAiUsageQuery();

  const [saveSettings, saveStatus] = useUpdateAiSettingsMutation();
  const [saveProvider] = useSaveAiProviderMutation();
  const [probe, probeState] = useProbeAiProviderMutation();
  const [triggerRun, triggerState] = useTriggerAiRunMutation();

  const [form, setForm] = useState<AiAutomationSettingsDTO | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const settings: AiAutomationSettingsDTO | null = form ?? settingsQ.data ?? null;

  const patch = (p: Partial<AiAutomationSettingsDTO>) => setForm((f) => ({
    ...(settingsQ.data ?? {}),
    ...(f ?? {}),
    ...p,
  }) as AiAutomationSettingsDTO);

  const save = async () => {
    if (!form) return;
    setMessage(null);
    try {
      const saved = await saveSettings(form).unwrap();
      setForm(saved);
      setMessage({ kind: "ok", text: "Automation settings saved." });
    } catch (err) {
      setMessage({ kind: "err", text: explainRtkError(err, "Failed to save settings") });
    }
  };

  const handleKey = async (provider: AiProviderId, apiKey: string) => {
    setKeys((k) => ({ ...k, [provider]: apiKey }));
    try {
      await saveProvider({ provider, body: { apiKey } }).unwrap();
      setMessage({ kind: "ok", text: `${PROVIDER_NAMES[provider]} key saved (stored encrypted).` });
      setKeys((k) => ({ ...k, [provider]: "" }));
    } catch (err) {
      setMessage({ kind: "err", text: explainRtkError(err, "Failed to save key") });
    }
  };

  const runNow = async () => {
    setMessage(null);
    try {
      const res = await triggerRun({ isoDate: todayDouala(), slot: "MORNING" }).unwrap();
      setMessage({ kind: "ok", text: `Triggered run ${res.runId} (${res.state}). Poll "Recent runs" to watch it.` });
    } catch (err) {
      setMessage({ kind: "err", text: explainRtkError(err, "Failed to trigger run") });
    }
  };

  const providers: AiProviderConfigDTO[] = providersQ.data ?? [];
  const health = healthQ.data as { nextRun?: { slot: string; isoDate: string; dueAt: string } | null; killSwitch?: boolean; runStateDistribution?: Record<string, number>; reserveAvailable?: number; reserveTarget?: number } | undefined;
  const usage = usageQ.data as { todaySpend?: number; monthSpend?: number; dailyBudgetCents?: number; monthlyBudgetCents?: number; today?: { calls?: number; costCents?: number; images?: number }; month?: { calls?: number; costCents?: number; images?: number } } | undefined;

  if (settingsQ.isError || providersQ.isError) {
    return <div className="space-y-4"><PageHeader title="AI Content Automation" description="Autonomous NNACT content on an unattended schedule" /><Card className="border-red/30 bg-red/5"><CardContent className="p-4"><p className="text-sm text-red">Failed to load AI settings</p></CardContent></Card></div>;
  }
  if (settingsQ.isLoading || providersQ.isLoading) {
    return <div className="space-y-4"><PageHeader title="AI Content Automation" description="Autonomous NNACT content on an unattended schedule" /><Skeleton className="h-64" /></div>;
  }
  if (!settings) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Content Automation"
        description="Autonomous NNACT content: plan → generate → review → publish (blog + LinkedIn) twice a day with guardrails"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" loading={triggerState.isLoading} onClick={runNow}>Generate now</Button>
            <Button variant="secondary" onClick={() => { settingsQ.refetch(); providersQ.refetch(); healthQ.refetch(); runsQ.refetch(); usageQ.refetch(); }}>Refresh</Button>
          </div>
        }
      />

      {message && <Card className="border-border bg-surface-300/50"><CardContent className="p-3"><p className={`text-sm ${message.kind === "err" ? "text-red" : "text-fg"}`}>{message.text}</p></CardContent></Card>}

      {health?.killSwitch && (
        <Card className="border-red/40 bg-red/5"><CardContent className="p-3"><p className="text-sm text-red">Global kill switch active (AI_AUTOPUBLISH_DISABLED) — no slots will run.</p></CardContent></Card>
      )}

      {settings && (
        <Card>
          <CardContent className="p-5 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-fg">Schedule</h3>
                <p className="text-xs text-fg-muted">Next run: {health?.nextRun ? `${health.nextRun.slot} ${health.nextRun.isoDate} (${new Date(health.nextRun.dueAt).toLocaleString()})` : "none (all disabled days)"}</p>
              </div>
              <div className="flex items-center gap-3">
                <Label htmlFor="ai-enabled" className="text-sm text-fg">Enabled</Label>
                <Switch id="ai-enabled" checked={settings.enabled} onCheckedChange={(v) => patch({ enabled: v })} />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-xs text-fg-muted">Timezone</Label>
                <FormSelect value={settings.timezone} onChange={(v) => patch({ timezone: v })} options={[{ value: "Africa/Douala", label: "Africa/Douala (UTC+1)" }, { value: "Africa/Lagos", label: "Africa/Lagos (UTC+1)" }, { value: "Africa/Casablanca", label: "Africa/Casablanca (UTC+0)" }, { value: "UTC", label: "UTC" }]} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-fg-muted">Morning publish</Label>
                <Input type="time" value={settings.morningTime} onChange={(e) => patch({ morningTime: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-fg-muted">Evening publish</Label>
                <Input type="time" value={settings.eveningTime} onChange={(e) => patch({ eveningTime: e.target.value })} />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-fg-muted">Active days</Label>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((day) => (
                  <Button key={day} size="sm" variant={settings.enabledDays.includes(day) ? "default" : "secondary"} onClick={() => patch({ enabledDays: settings.enabledDays.includes(day) ? settings.enabledDays.filter((d) => d !== day) : [...settings.enabledDays, day] })}>
                    {day}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs text-fg-muted">Channels</Label>
                <div className="flex flex-wrap gap-2">
                  {["WEBSITE", "LINKEDIN"].map((channel) => (
                    <Button key={channel} size="sm" variant={settings.channels.includes(channel) ? "default" : "secondary"} onClick={() => patch({ channels: settings.channels.includes(channel) ? settings.channels.filter((c) => c !== channel) : [...settings.channels, channel] })}>
                      {channel}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-fg-muted">Text provider order</Label>
                <FormSelect
                  value={settings.textProviderOrder[0] ?? "CLAUDE"}
                  onChange={(v) => patch({ textProviderOrder: [v as AiProviderId, ...PROVIDERS.filter((p) => p !== v)] })}
                  options={PROVIDERS.map((p) => ({ value: p, label: PROVIDER_NAMES[p] }))}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-xs text-fg-muted">Quality threshold (0-100)</Label>
                <Input type="number" min={0} max={100} value={settings.qualityThreshold} onChange={(e) => patch({ qualityThreshold: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-fg-muted">Catch-up window (min)</Label>
                <Input type="number" min={0} value={settings.catchUpWindowMinutes} onChange={(e) => patch({ catchUpWindowMinutes: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-fg-muted">Max retries</Label>
                <Input type="number" min={0} max={10} value={settings.maxRetries} onChange={(e) => patch({ maxRetries: Number(e.target.value) })} />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-xs text-fg-muted">Reserve pool target</Label>
                <Input type="number" min={0} max={50} value={settings.reserveTarget} onChange={(e) => patch({ reserveTarget: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-fg-muted">Daily budget (cents)</Label>
                <Input type="number" min={0} value={settings.dailyBudgetCents} onChange={(e) => patch({ dailyBudgetCents: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-fg-muted">Monthly budget (cents)</Label>
                <Input type="number" min={0} value={settings.monthlyBudgetCents} onChange={(e) => patch({ monthlyBudgetCents: Number(e.target.value) })} />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button loading={saveStatus.isLoading} onClick={save}>Save settings</Button>
              {form && <Button variant="secondary" onClick={() => setForm(null)}>Discard changes</Button>}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-5 space-y-3">
            <h3 className="text-sm font-semibold text-fg">Providers</h3>
            {PROVIDERS.map((provider) => {
              const cfg = providers.find((p) => p.provider === provider);
              return (
                <div key={provider} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium text-fg">{PROVIDER_NAMES[provider]}</h4>
                      <Badge className={`${STATUS_COLOR[cfg?.status ?? "DISCONNECTED"] ?? ""} border-transparent`}>{cfg?.status ?? "DISCONNECTED"}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={cfg?.enabled ?? false}
                        onCheckedChange={(v) => { void saveProvider({ provider, body: { enabled: v } }); }}
                      />
                      <Button size="sm" variant="secondary" loading={probeState.isLoading} onClick={() => { void probe(provider); }}>Probe</Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input type="password" placeholder="API key (saved encrypted)" value={keys[provider] ?? ""} onChange={(e) => setKeys((k) => ({ ...k, [provider]: e.target.value }))} />
                    <Button size="sm" disabled={!keys[provider]} onClick={() => void handleKey(provider, keys[provider] ?? "")}>Save key</Button>
                  </div>
                  {cfg?.lastError && <p className="text-xs text-red">{cfg.lastError}</p>}
                  <p className="text-xs text-fg-muted">Models: {cfg?.defaultTextModel ?? "default"} · timeout {cfg?.timeoutMs ?? 30000}ms</p>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-3">
            <h3 className="text-sm font-semibold text-fg">Usage (AI API)</h3>
            {usage ? (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-surface-300/40 p-3">
                  <p className="text-xs text-fg-muted">Today</p>
                  <p className="text-fg">{usage.today?.calls ?? 0} calls · {usage.today?.images ?? 0} images</p>
                  <p className="text-red-500">{usage.todaySpend}c / {usage.dailyBudgetCents}c budget</p>
                </div>
                <div className="rounded-lg bg-surface-300/40 p-3">
                  <p className="text-xs text-fg-muted">This month</p>
                  <p className="text-fg">{usage.month?.calls ?? 0} calls · {usage.month?.images ?? 0} images</p>
                  <p className="text-amber-500">{usage.monthSpend}c / {usage.monthlyBudgetCents}c budget</p>
                </div>
              </div>
            ) : <Skeleton className="h-24" />}

            <h3 className="text-sm font-semibold text-fg pt-2">Reserve pool</h3>
            <p className="text-xs text-fg-muted">Pre-approved evergreen pieces ready to publish on schedule.</p>
            <p className="text-sm text-fg">{health?.reserveAvailable ?? 0} ready of {health?.reserveTarget ?? 0} target</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-5">
          <h3 className="text-sm font-semibold text-fg mb-3">Recent runs</h3>
          <div className="space-y-2">
            {(runsQ.data?.items ?? []).map((run) => (
              <div key={run.id} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate text-fg">{run.topic ?? `${run.slot} ${run.scheduledDate}`}</p>
                  <p className="text-xs text-fg-muted">{run.slot} · {run.scheduledDate} · {run.contentType ?? "article"} · quality {run.quality ?? "—"}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {run.error && <p className="max-w-[240px] truncate text-xs text-red" title={run.error}>{run.error}</p>}
                  <Badge className="border-transparent bg-surface-300/60 text-fg">{run.state}</Badge>
                </div>
              </div>
            ))}
            {runsQ.data && runsQ.data.items.length === 0 && <p className="text-sm text-fg-muted">No runs yet — flip the schedule on and the worker will create them.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}