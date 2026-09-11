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
import { RunProgress } from "@/components/ai/run-progress";
import { isActiveRun } from "@/components/ai/run-steps";
import { BudgetMeter, UsageTrendChart } from "@/components/ai/usage/usage-charts";
import { cn } from "@/lib/utils";
import Link from "next/link";

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
  const [models, setModels] = useState<Record<string, { text: string; image: string }>>({});
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
    const selected = providers.find((p) => p.provider === provider);
    const current = models[provider];
    const textModel = (current !== undefined ? current.text : selected?.defaultTextModel) ?? "";
    const imageModel = (current !== undefined ? current.image : selected?.defaultImageModel) ?? "";
    try {
      await saveProvider({
        provider,
        body: { apiKey, defaultTextModel: textModel.trim() || null, defaultImageModel: imageModel.trim() || null },
      }).unwrap();
      setMessage({ kind: "ok", text: `${PROVIDER_NAMES[provider]} key saved (stored encrypted).` });
      setKeys((k) => ({ ...k, [provider]: "" }));
    } catch (err) {
      setMessage({ kind: "err", text: explainRtkError(err, "Failed to save key") });
    }
  };

  const handleModels = async (provider: AiProviderId) => {
    const current = models[provider];
    if (current === undefined) return;
    try {
      await saveProvider({
        provider,
        body: { defaultTextModel: current.text.trim() || null, defaultImageModel: current.image.trim() || null },
      }).unwrap();
      setMessage({ kind: "ok", text: `${PROVIDER_NAMES[provider]} models saved.` });
    } catch (err) {
      setMessage({ kind: "err", text: explainRtkError(err, "Failed to save models") });
    }
  };

  const runNow = async () => {
    setMessage(null);
    try {
      const res = await triggerRun({ isoDate: todayDouala(), slot: "MORNING" }).unwrap();
      setMessage({ kind: "ok", text: `Run ${res.runId.slice(0, 8)} queued — watch it live in the tray (bottom right).` });
    } catch (err) {
      setMessage({ kind: "err", text: explainRtkError(err, "Failed to trigger run") });
    }
  };

  const providers: AiProviderConfigDTO[] = providersQ.data ?? [];
  const activeRun = (runsQ.data?.items ?? []).find((r) => isActiveRun(r)) ?? null;
  const health = healthQ.data as { nextRun?: { slot: string; isoDate: string; dueAt: string } | null; killSwitch?: boolean; runStateDistribution?: Record<string, number>; reserveAvailable?: number; reserveTarget?: number } | undefined;
  const usage = usageQ.data;

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

      {activeRun && (
        <Card className="border-blue/30">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-fg">Live generation</h3>
              <span className="flex items-center gap-1.5 text-xs font-medium text-blue">
                <span className="h-2 w-2 animate-pulse rounded-full bg-blue" />
                running
              </span>
            </div>
            <RunProgress run={activeRun} />
          </CardContent>
        </Card>
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
                    <Button size="sm" variant="outline" disabled={models[provider] === undefined} onClick={() => void handleModels(provider)}>Save models</Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input size={1} className="h-8 text-xs" placeholder="Text model (e.g. gpt-4o)" value={models[provider] !== undefined ? models[provider].text : (cfg?.defaultTextModel ?? "")} onChange={(e) => setModels((m) => ({ ...m, [provider]: { text: e.target.value, image: m[provider] !== undefined ? m[provider].image : (cfg?.defaultImageModel ?? "") } }))} />
                    <Input size={1} className="h-8 text-xs" placeholder="Image model (e.g. gpt-image-1)" value={models[provider] !== undefined ? models[provider].image : (cfg?.defaultImageModel ?? "")} onChange={(e) => setModels((m) => ({ ...m, [provider]: { image: e.target.value, text: m[provider] !== undefined ? m[provider].text : (cfg?.defaultTextModel ?? "") } }))} />
                  </div>
                  {cfg?.lastError && <p className="text-xs text-red">{cfg.lastError}</p>}
                  <p className="text-xs text-fg-muted">Models: {cfg?.defaultTextModel ?? "default"} · timeout {cfg?.timeoutMs ?? 30000}ms</p>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-fg">Usage (AI API)</h3>
              <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
                <Link href="/ai/usage">Analytics ↗</Link>
              </Button>
            </div>
            {usage ? (
              <div className="grid gap-2 md:grid-cols-2">
                <div className="rounded-lg bg-surface-300/40 p-3">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-xs text-fg-muted">Today</p>
                      <p className="text-lg font-bold text-fg">{usage.today?.calls ?? 0}<span className="ml-1 text-xs font-normal text-fg-muted">calls · {usage.today?.images ?? 0} images</span></p>
                    </div>
                    <p className="text-xs font-mono text-fg-muted">{usage.todaySpend}c</p>
                  </div>
                  <div className="mt-2"><BudgetMeter spent={usage.todaySpend} budget={usage.dailyBudgetCents} tone={usage.dailyBudgetCents > 0 && usage.todaySpend / usage.dailyBudgetCents > 0.8 ? "red" : "green"} /></div>
                </div>
                <div className="rounded-lg bg-surface-300/40 p-3">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-xs text-fg-muted">This month</p>
                      <p className="text-lg font-bold text-fg">{usage.month?.calls ?? 0}<span className="ml-1 text-xs font-normal text-fg-muted">calls · {usage.month?.images ?? 0} images</span></p>
                    </div>
                    <p className="text-xs font-mono text-fg-muted">{usage.monthSpend}c</p>
                  </div>
                  <div className="mt-2"><BudgetMeter spent={usage.monthSpend} budget={usage.monthlyBudgetCents} tone={usage.monthlyBudgetCents > 0 && usage.monthSpend / usage.monthlyBudgetCents > 0.5 ? "amber" : "green"} /></div>
                </div>
              </div>
            ) : <Skeleton className="h-24" />}

            <div className="pt-1">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs text-fg-muted">Spend · last 30 days</p>
                <span className="font-mono text-xs text-fg-muted">{usage?.analytics?.daily.reduce((a, d) => a + d.costCents, 0).toLocaleString() ?? 0}c</span>
              </div>
              <div className="h-36">
                {usage?.analytics?.daily.length ? <UsageTrendChart data={usage.analytics.daily} /> : <Skeleton className="h-full w-full" />}
              </div>
            </div>

            <div className="pt-1">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-fg">Reserve pool</h3>
                <span className="text-xs text-fg-muted">{health?.reserveAvailable ?? 0} ready of {health?.reserveTarget ?? 0} target</span>
              </div>
              <p className="text-xs text-fg-muted">Pre-approved evergreen pieces ready to publish on schedule.</p>
              <div className="mt-2">
                <BudgetMeter
                  spent={(health?.reserveAvailable ?? 0) * 100}
                  budget={Math.max(1, health?.reserveTarget ?? 4) * 100}
                  tone={health?.reserveAvailable && health?.reserveTarget && health.reserveAvailable >= health.reserveTarget ? "green" : "amber"}
                />
              </div>
            </div>
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
                  <Badge className={cn("border-transparent", isActiveRun(run) ? "bg-blue/10 text-blue" : run.state === "PUBLISHED" || run.state === "PARTIALLY_PUBLISHED" ? "bg-green/10 text-green" : run.state === "NEEDS_ATTENTION" ? "bg-amber/10 text-amber" : "bg-red/10 text-red")}>{run.state}</Badge>
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