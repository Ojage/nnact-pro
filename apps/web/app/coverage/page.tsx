import Link from "next/link";
import { serverApi } from "@/lib/server-api";
import type { CoverageResponse } from "@/lib/diagnostics-api";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

const EMPTY: CoverageResponse = {
  workflows: [],
  families: [],
  quality: { openCorrections: 0, safetyCriticalCorrections: 0, corrections: [] },
  demand: { totalSessions: 0, unsupportedOrUnresolved: 0, blocked: 0, escalated: 0 },
};

function statusPill(status: string) {
  if (["published", "validated"].includes(status))
    return "border-green/30 bg-green/5 text-green";
  if (["suspended", "unsupported"].includes(status))
    return "border-red/30 bg-red/5 text-red";
  if (["pilot", "experimental"].includes(status))
    return "border-yellow/30 bg-yellow/5 text-yellow";
  return "border-border bg-surface-300 text-fg-muted";
}

function coverageStatus(bestWorkflow: CoverageResponse["families"][number]["bestWorkflow"]) {
  if (!bestWorkflow) return { label: "No workflow", pill: "border-red/30 bg-red/5 text-red" };
  if (bestWorkflow.supportStatus === "validated" && bestWorkflow.lifecycleStatus === "published")
    return { label: "Validated", pill: "border-green/30 bg-green/5 text-green" };
  if (bestWorkflow.supportStatus === "pilot")
    return { label: "Pilot", pill: "border-yellow/30 bg-yellow/5 text-yellow" };
  if (bestWorkflow.supportStatus === "experimental")
    return { label: "Experimental", pill: "border-yellow/30 bg-yellow/5 text-yellow" };
  if (bestWorkflow.lifecycleStatus === "suspended")
    return { label: "Suspended", pill: "border-red/30 bg-red/5 text-red" };
  return { label: bestWorkflow.supportStatus, pill: "border-border bg-surface-300 text-fg-muted" };
}

function severityPill(severity: string) {
  if (severity === "safety_critical") return "border-red/30 bg-red/5 text-red";
  if (severity === "high") return "border-orange/30 bg-orange/5 text-orange";
  if (severity === "medium") return "border-yellow/30 bg-yellow/5 text-yellow";
  return "border-border bg-surface-300 text-fg-muted";
}

export default async function CoveragePage() {
  let coverage = EMPTY;
  let error: string | null = null;
  try {
    coverage = await serverApi.diagnosticsCoverage();
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }

  const validated = coverage.workflows.filter(
    (w) => w.lifecycleStatus === "published" && w.supportStatus === "validated",
  ).length;
  const held = coverage.workflows.filter((w) => w.lifecycleStatus === "suspended").length;
  const gaps = coverage.families.filter((f) => !f.bestWorkflow);

  return (
    <div>
      <PageHeader
        title="Coverage & quality"
        description="Which product families can we diagnose automatically today, where is field demand uncovered, and how healthy are published workflows?"
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

      {/* --- Hero stats --- */}
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-6">
        {[
          ["Validated workflows", validated, "text-green"],
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

      <div className="space-y-8">
        {/* --- Coverage gaps by product family --- */}
        <Card>
          <CardHeader>
            <CardTitle>
              Coverage by product family
              {gaps.length > 0 && (
                <span className="ml-2 rounded-full bg-red/10 px-2 py-0.5 text-[10px] font-semibold text-red">
                  {gaps.length} gap{gaps.length !== 1 && "s"}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {coverage.families.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <p className="font-semibold text-fg">No diagnostic sessions yet</p>
                <p className="mt-1 text-sm text-fg-muted">
                  Coverage gaps will appear here once field sessions are recorded.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product type</TableHead>
                    <TableHead>Make</TableHead>
                    <TableHead className="text-right">Sessions</TableHead>
                    <TableHead className="text-right">Blocked</TableHead>
                    <TableHead className="text-right">Escalated</TableHead>
                    <TableHead className="text-right">Unsupported</TableHead>
                    <TableHead>Coverage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coverage.families.map((family) => {
                    const cs = coverageStatus(family.bestWorkflow);
                    return (
                      <TableRow key={`${family.productType}|${family.make}`}>
                        <TableCell className="font-medium">{family.productType}</TableCell>
                        <TableCell>{family.make}</TableCell>
                        <TableCell className="text-right tabular-nums">{family.sessions}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {family.blocked > 0 ? (
                            <span className="text-red">{family.blocked}</span>
                          ) : (
                            <span className="text-fg-dim">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {family.escalated > 0 ? (
                            <span className="text-red">{family.escalated}</span>
                          ) : (
                            <span className="text-fg-dim">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {family.unsupported > 0 ? (
                            <span className="text-yellow">{family.unsupported}</span>
                          ) : (
                            <span className="text-fg-dim">0</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-block rounded-full border px-2.5 py-1 text-[10px] font-semibold capitalize ${cs.pill}`}
                          >
                            {cs.label}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* --- Workflow library health --- */}
        <Card>
          <CardHeader>
            <CardTitle>Workflow library</CardTitle>
          </CardHeader>
          <CardContent>
            {coverage.workflows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <p className="font-semibold text-fg">No diagnostic workflows yet</p>
                <p className="mt-1 text-sm text-fg-muted">
                  Create the first workflow in the Diagnostic Library to begin covering product families.
                </p>
                <Link href="/diagnostic-library">
                  <Button size="sm" className="mt-4">Open Diagnostic Library</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {coverage.workflows.map((workflow) => {
                  const workflowCorrections = coverage.quality.corrections.filter(
                    (c) => c.correction.workflowId === workflow.id,
                  );
                  const hasOpenCorrections = workflowCorrections.length > 0;
                  return (
                    <div
                      key={workflow.id}
                      className={`rounded-xl border p-4 ${
                        hasOpenCorrections
                          ? "border-yellow/30 bg-yellow/5"
                          : "border-border bg-surface-200"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-fg">{workflow.name}</p>
                            {hasOpenCorrections && (
                              <span
                                className={`inline-block rounded-full border px-2 py-0.5 text-[9px] font-semibold ${severityPill(workflowCorrections[0].correction.severity)}`}
                              >
                                {workflowCorrections.length} open correction{workflowCorrections.length !== 1 && "s"}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-fg-muted">
                            {[workflow.make, workflow.modelFamily, workflow.productType]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                          <p className="mt-1 text-[11px] text-fg-dim">
                            Source revision: {workflow.sourceRevision || "not recorded"} · Version{" "}
                            {workflow.versionNumber}
                          </p>
                        </div>
                        <div className="flex gap-1.5">
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold capitalize ${statusPill(workflow.supportStatus)}`}
                          >
                            {workflow.supportStatus}
                          </span>
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold capitalize ${statusPill(workflow.lifecycleStatus)}`}
                          >
                            {workflow.lifecycleStatus.replaceAll("_", " ")}
                          </span>
                        </div>
                      </div>
                      {workflow.limitations.length > 0 && (
                        <div className="mt-3 rounded-lg border border-yellow/20 bg-yellow/5 p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-yellow">
                            Known limitations
                          </p>
                          <ul className="mt-1 space-y-1 text-xs text-fg-muted">
                            {workflow.limitations.map((limitation) => (
                              <li key={limitation}>&#8226; {limitation}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* --- Open corrections --- */}
        {coverage.quality.openCorrections > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>
                Open corrections
                <span className="ml-2 rounded-full bg-red/10 px-2 py-0.5 text-[10px] font-semibold text-red">
                  {coverage.quality.openCorrections}
                  {coverage.quality.safetyCriticalCorrections > 0 &&
                    ` · ${coverage.quality.safetyCriticalCorrections} safety critical`}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {coverage.quality.corrections.map((entry) => (
                  <div
                    key={entry.correction.id}
                    className="rounded-xl border border-border bg-surface-200 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-block rounded-full border px-2 py-0.5 text-[9px] font-semibold capitalize ${severityPill(entry.correction.severity)}`}
                          >
                            {entry.correction.severity.replaceAll("_", " ")}
                          </span>
                          <span className="text-xs text-fg-dim">
                            {entry.correction.category.replaceAll("_", " ")}
                          </span>
                        </div>
                        <p className="mt-1.5 text-sm text-fg">{entry.correction.description}</p>
                        <p className="mt-1 text-[11px] text-fg-dim">
                          on {entry.workflow.name} · v{entry.correction.workflowVersion}
                        </p>
                      </div>
                      <span className="rounded-full border border-border px-2 py-0.5 text-[9px] font-medium text-fg-muted">
                        {entry.correction.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
