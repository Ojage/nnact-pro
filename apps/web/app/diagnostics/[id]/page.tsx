import Link from "next/link";
import { notFound } from "next/navigation";
import type { DiagnosticSessionDetail } from "@/lib/diagnostics-api";
import { serverApi } from "@/lib/server-api";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { DiagnosticSessionClient } from "./session-client";
import { CompletionPanel } from "./completion-panel";

export default async function DiagnosticSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let detail: DiagnosticSessionDetail;
  try {
    detail = await serverApi.diagnosticSession(id);
  } catch {
    notFound();
  }

  const applianceName =
    [detail.equipment.make, detail.equipment.model].filter(Boolean).join(" ") ||
    detail.equipment.type;

  return (
    <div>
      <PageHeader
        title={applianceName}
        description={
          <span>
            {detail.job.title} · {detail.session.status.replaceAll("_", " ")}
            {detail.workflow
              ? ` · ${detail.workflow.name} v${detail.session.workflowVersion ?? detail.workflow.versionNumber}`
              : " · coverage required"}
          </span>
        }
        actions={
          <div className="flex gap-2">
            <Link href={`/jobs/${detail.job.id}`}>
              <Button variant="secondary" size="sm">Work order</Button>
            </Link>
            <Link href="/diagnostics">
              <Button variant="secondary" size="sm">All diagnostics</Button>
            </Link>
          </div>
        }
      />
      <DiagnosticSessionClient initialDetail={detail} />
      <CompletionPanel
        sessionId={detail.session.id}
        initialStatus={detail.session.status}
        initialDisposition={detail.session.disposition}
        initialSummary={detail.session.summary}
      />
    </div>
  );
}
