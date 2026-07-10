import Link from "next/link";
import { diagnosticsApi, type CoverageResponse } from "@/lib/diagnostics-api";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const EMPTY: CoverageResponse = {
  workflows: [],
  demand: { totalSessions: 0, unsupportedOrUnresolved: 0, blocked: 0, escalated: 0 },
};

function tone(status: string) {
  if (["published", "validated"].includes(status)) return "bg-green/10 text-green";
  if (["suspended", "unsupported"].includes(status)) return "bg-red/10 text-red";
  if (["pilot", "experimental"].includes(status)) return "bg-yellow/10 text-yellow";
  return "bg-surface-400 text-fg-muted";
}

export default async function CoveragePage() {
  let coverage = EMPTY;
  let error: string | null = null;
  try {
    coverage = await diagnosticsApi.coverage();
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }

  const validated = coverage.workflows.filter(
    (workflow) => workflow.lifecycleStatus === "published" && workflow.supportStatus === "validated",
  ).length;
  const held = coverage.workflows.filter((workflow) => workflow.lifecycleStatus === "suspended").length;

  return (
    <div>
      <PageHeader
        title="Coverage & quality"
        description="See what OpenFieldPro can support, where field demand exceeds coverage, and which workflows require review."
        actions={
          <Link href="/diagnostics">
            <Button variant="secondary" size="sm">Back to diagnostics</Button>
          </Link>
        }
      />

      {error && (
        <Card className="mb-6 border-yellow/30 bg-yellow/5">
          <CardContent className="pt-5 text-sm text-yellow">{error}</CardContent>
        </Card>
      )}

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-6">
        {[
          ["Validated", validated, "text-green"],
          ["Pilot / experimental", coverage.workflows.length - validated - held, "text-yellow"],
          ["Suspended", held, "text-red"],
          ["Sessions", coverage.demand.totalSessions, "text-blue"],
          ["Needs coverage", coverage.demand.unsupportedOrUnresolved, "text-yellow"],
          ["Escalated", coverage.demand.escalated, "text-red"],
        ].map(([label, value, className]) => (
          <Card key={String(label)}>
            <CardContent className="p-4">
              <p className="text-[10px] uppercase tracking-wide text-fg-dim">{label}</p>
              <p className={`mt-1 text-2xl font-bold ${className}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
        <Card>
          <CardHeader>
            <CardTitle>Workflow library status</CardTitle>
          </CardHeader>
          <CardContent>
            {coverage.workflows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <p className="font-semibold text-fg">No diagnostic workflows yet</p>
                <p className="mt-1 text-sm text-fg-muted">
                  The operations core remains usable. Add the first model-family workflow before advertising diagnostic coverage.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {coverage.workflows.map((workflow) => (
                  <div key={workflow.id} className="rounded-xl border border-border bg-surface-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-fg">{workflow.name}</p>
                        <p className="mt-1 text-xs text-fg-muted">
                          {[workflow.make, workflow.modelFamily, workflow.productType].filter(Boolean).join(" · ")}
                        </p>
                        <p className="mt-2 text-xs text-fg-dim">
                          Source revision: {workflow.sourceRevision || "not recorded"} · Version {workflow.versionNumber}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize ${tone(workflow.supportStatus)}`}>
                          {workflow.supportStatus}
                        </span>
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize ${tone(workflow.lifecycleStatus)}`}>
                          {workflow.lifecycleStatus.replaceAll("_", " ")}
                        </span>
                      </div>
                    </div>
                    {workflow.limitations.length > 0 && (
                      <div className="mt-3 rounded-lg border border-yellow/20 bg-yellow/5 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-yellow">Known limitations</p>
                        <ul className="mt-1 space-y-1 text-xs text-fg-muted">
                          {workflow.limitations.map((limitation) => <li key={limitation}>• {limitation}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Publication gate</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm text-fg-muted">
              <p>Exact technician-facing labels</p>
              <p>Resolved meter endpoints</p>
              <p>Correct operating condition</p>
              <p>Expected result and interpretation</p>
              <p>Continuous route with no islands</p>
              <p>No unintended branches or bus crossings</p>
              <p>Electrical review</p>
              <p>Visual trace audit</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Product rule</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-fg-muted">
                Unsupported demand is product evidence. It should influence the next model-family build, but it must never trigger an automatically published, unreviewed diagnostic path.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
