"use client";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useSessionUser } from "@/lib/use-session-user";
import {
  useGrowthAutopilotDecisionsQuery,
  useGrowthAutopilotSettingsQuery,
  usePauseGrowthAutopilotMutation,
  useResumeGrowthAutopilotMutation,
  useRunGrowthAutopilotCycleMutation,
  useSimulateGrowthAutopilotMutation,
  useUpdateGrowthAutopilotSettingsMutation,
} from "@/lib/redux/api";

export default function AutopilotPage() {
  const { data: settings } = useGrowthAutopilotSettingsQuery();
  const { data: decisions = [] } = useGrowthAutopilotDecisionsQuery();
  const [updateSettings] = useUpdateGrowthAutopilotSettingsMutation();
  const [pause] = usePauseGrowthAutopilotMutation();
  const [resume] = useResumeGrowthAutopilotMutation();
  const [runCycle, { data: lastRun }] = useRunGrowthAutopilotCycleMutation();
  const [simulate, { data: simResult, isLoading: simulating }] = useSimulateGrowthAutopilotMutation();

  // Reads (settings, decisions) are open to every Growth role, but every
  // control below is requireGrowthOwner server-side. A dispatcher or secretary
  // previously saw live controls that 403'd on click.
  const { user } = useSessionUser();
  const isOwner = user?.role === "owner";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Autopilot"
        description="Observe by default. Pause stops all campaign and follow-up sends immediately."
      />
      {!isOwner ? (
        <p className="text-sm text-fg-muted">Autopilot settings are managed by an owner. You can view the current mode and decision log below.</p>
      ) : null}
      {settings ? (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 pt-4 text-sm">
            <span>
              Mode: <strong>{settings.mode}</strong>
            </span>
            <span className={settings.paused ? "text-amber-600" : "text-emerald-600"}>
              {settings.paused ? "Paused" : "Running policy"}
            </span>
            <span className={settings.coldTransportReady ? "text-emerald-600" : "text-amber-600"}>
              Cold transport: {settings.coldTransportReady ? "ready" : "not configured"}
            </span>
            {isOwner ? (
              <>
                <Button size="sm" variant="outline" onClick={() => updateSettings({ mode: "OBSERVE" })}>
                  Observe
                </Button>
                <Button size="sm" variant="outline" onClick={() => updateSettings({ mode: "ASSISTED" })}>
                  Assisted
                </Button>
                <Button size="sm" variant="outline" onClick={() => updateSettings({ mode: "AUTOPILOT" })}>
                  Autopilot
                </Button>
                {settings.paused ? (
                  <Button size="sm" onClick={() => resume()}>
                    Resume
                  </Button>
                ) : (
                  <Button size="sm" variant="destructive" onClick={() => pause()}>
                    Pause all sends
                  </Button>
                )}
                <Button size="sm" onClick={() => runCycle()}>
                  Run cycle now
                </Button>
                <Button size="sm" variant="secondary" disabled={simulating} onClick={() => simulate({})}>
                  Simulate allocation
                </Button>
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      {lastRun ? <p className="text-sm text-fg-muted">{lastRun.message}</p> : null}
      {simResult ? (
        <Card>
          <CardContent className="space-y-2 pt-4 text-sm">
            <p className="font-medium">Simulation (no email sent)</p>
            <p className="text-fg-muted">{simResult.summary}</p>
            {simResult.allocations?.map((a) => (
              <p key={a.sectorId}>
                {a.name}: {a.previousAllocation} → {a.newAllocation} — {a.reasoning}
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Autopilot decisions</h2>
        {decisions.map((d) => (
          <Card key={d.id}>
            <CardContent className="space-y-1 pt-4 text-sm">
              <p className="font-medium">{d.sectorName ?? "Org-wide"}</p>
              <p className="text-fg-muted">
                {d.previousAllocation} → {d.newAllocation}
              </p>
              <p>{d.reasoning}</p>
            </CardContent>
          </Card>
        ))}
        {decisions.length === 0 ? <p className="text-sm text-fg-muted">No allocation decisions recorded yet.</p> : null}
      </div>
    </div>
  );
}
