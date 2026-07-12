import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import {
  diagnosticsApi,
  type DiagnosticOverview,
  type DiagnosticSessionListItem,
} from "@/lib/diagnostics-api";

const EMPTY_OVERVIEW: DiagnosticOverview = {
  activeSessions: 0,
  blockedSessions: 0,
  unsupportedOrUnresolved: 0,
  publishedWorkflows: 0,
  pilotWorkflows: 0,
  openCorrections: 0,
  safetyCriticalCorrections: 0,
};

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function statusTone(status: string) {
  if (["blocked", "suspended"].includes(status)) return "border-red/30 bg-red/5 text-red";
  if (["diagnosed", "completed", "published"].includes(status)) {
    return "border-green/30 bg-green/5 text-green";
  }
  if (["workflow_ready", "testing"].includes(status)) return "border-blue/30 bg-blue/5 text-blue";
  return "border-border bg-surface-300 text-fg-muted";
}

export default async function DiagnosticsPage() {
  let overview = EMPTY_OVERVIEW;
  let sessions: DiagnosticSessionListItem[] = [];
  let apiError: string | null = null;

  try {
    [overview, sessions] = await Promise.all([diagnosticsApi.overview(), diagnosticsApi.sessions()]);
  } catch (error) {
    apiError = error instanceof Error ? error.message : String(error);
  }

  const active = sessions
    .filter((item) => !["completed", "inconclusive"].includes(item.session.status))
    .slice(0, 10);

  return (
    <div>
      <PageHeader
        title="Diagnostics"
        description="Execute, record, and audit appliance diagnostics without leaving the work order."
        actions={
          <div className="flex gap-2">
            <Link href="/coverage">
              <Button variant="secondary" size="sm">Coverage & quality</Button>
            </Link>
            <Link href="/diagnostics/new">
              <Button size="sm">+ Start diagnostic</Button>
            </Link>
          </div>
        }
      />

      {apiError && (
        <Card className="mb-6 border-yellow/30 bg-yellow/5">
          <CardContent className="pt-5">
            <p className="text-sm font-semibold text-yellow">Diagnostic API is not ready</p>
            <p className="mt-1 text-xs text-fg-muted">
              {apiError}. Run the database schema push before opening diagnostic sessions.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        {[
          ["Active", overview.activeSessions, "text-blue"],
          ["Blocked", overview.blockedSessions, "text-yellow"],
          ["Needs coverage", overview.unsupportedOrUnresolved, "text-yellow"],
          ["Published", overview.publishedWorkflows, "text-green"],
          ["Pilot", overview.pilotWorkflows, "text-blue"],
          ["Corrections", overview.openCorrections, "text-yellow"],
          ["Safety holds", overview.safetyCriticalCorrections, "text-red"],
        ].map(([label, value, tone]) => (
          <Card key={String(label)}>
            <CardContent className="p-4">
              <p className="text-[11px] uppercase tracking-wide text-fg-dim">{label}</p>
              <p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Active diagnostic sessions</CardTitle>
              <p className="mt-1 text-xs text-fg-muted">
                Appliance, complaint, workflow status, and next field action.
              </p>
            </div>
            <Link href="/jobs" className="text-xs text-fg-link">View jobs →</Link>
          </CardHeader>
          <CardContent>
            {active.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <p className="font-semibold text-fg">No active diagnostic sessions</p>
                <p className="mt-1 text-sm text-fg-muted">
                  Start from an assigned job and link the exact appliance before testing.
                </p>
                <Link href="/diagnostics/new" className="mt-4 inline-flex">
                  <Button size="sm">Start diagnostic</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {active.map(({ session, equipment, workflow }) => (
                  <Link
                    key={session.id}
                    href={`/diagnostics/${session.id}`}
                    className="block rounded-xl border border-border bg-surface-200 p-4 no-underline transition-colors hover:bg-surface-300"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-fg">
                          {[equipment.make, equipment.model].filter(Boolean).join(" ") || equipment.type}
                        </p>
                        <p className="mt-1 text-xs text-fg-muted">
                          {session.customerComplaint || "Complaint not recorded"}
                        </p>
                        <p className="mt-2 text-xs text-fg-dim">
                          {workflow ? `${workflow.name} · v${session.workflowVersion ?? workflow.versionNumber}` : "Workflow unresolved"}
                        </p>
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${statusTone(session.status)}`}>
                        {statusLabel(session.status)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Field execution contract</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm text-fg-muted">
              <p>1. Confirm model and serial.</p>
              <p>2. Confirm support status and workflow revision.</p>
              <p>3. Record the complaint separately from technician observation.</p>
              <p>4. Perform one exact check at a time.</p>
              <p>5. Record the actual reading before branching.</p>
              <p>6. Stop cleanly when the workflow is unsupported or unsafe.</p>
            </CardContent>
          </Card>

          <Card className={overview.safetyCriticalCorrections > 0 ? "border-red/40" : ""}>
            <CardHeader><CardTitle>Trust gate</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-fg-muted">
                Published checks require exact meter points, an operating condition, an expected result,
                validated route continuity, and a passed visual audit.
              </p>
              {overview.safetyCriticalCorrections > 0 && (
                <p className="mt-3 rounded-lg bg-red/10 p-3 text-sm font-semibold text-red">
                  {overview.safetyCriticalCorrections} safety-critical correction hold(s) require review.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
