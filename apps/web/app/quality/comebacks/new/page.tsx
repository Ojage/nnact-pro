"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useJobsQuery,
  useCustomersQuery,
  useCreateComebackMutation,
  useCreateComebackFromJobMutation,
} from "@/lib/redux/api";
import { COMEBACK_INTAKE_REASON, COMEBACK_INTAKE_REASON_LABEL, COMEBACK_SEVERITY_LABEL } from "@nnact/shared";
import type { ComebackIntakeReason, ComebackSeverity } from "@nnact/shared";

export default function NewComebackPage() {
  const router = useRouter();
  const params = useSearchParams();
  const preselectedJobId = params.get("jobId") ?? "";

  const { data: jobs = [] } = useJobsQuery();
  const { data: customers = [] } = useCustomersQuery();
  const [createCase, { isLoading: creatingCase }] = useCreateComebackMutation();
  const [createFromJob, { isLoading: creatingFromJob }] = useCreateComebackFromJobMutation();
  const isLoading = creatingCase || creatingFromJob;

  const [jobId, setJobId] = useState(preselectedJobId);
  const [complaintSummary, setComplaintSummary] = useState("");
  const [complaintDetails, setComplaintDetails] = useState("");
  const [intakeReason, setIntakeReason] = useState<ComebackIntakeReason | "">("");
  const [severity, setSeverity] = useState<ComebackSeverity | "">("");
  const [error, setError] = useState<string | null>(null);

  const selectedJob = jobs.find((j) => j.id === jobId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!jobId) { setError("Please select the original job."); return; }
    try {
      const payload = {
        jobId,
        ...(complaintSummary.trim() && { complaintSummary: complaintSummary.trim() }),
        ...(complaintDetails.trim() && { complaintDetails: complaintDetails.trim() }),
        ...(intakeReason && { intakeReason }),
        ...(severity && { severity }),
      };
      const result = await createFromJob(payload).unwrap();
      router.push(`/quality/comebacks/${result.id}`);
    } catch (err) {
      setError(String(err));
    }
  }

  const customerMap = new Map(customers.map((c) => [c.id, c]));

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Report a Comeback" description="Flag a completed job as a comeback for investigation." />

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-xl border border-red/30 bg-red/5 p-3 text-sm text-red">{error}</div>
        )}

        <Card>
          <CardHeader><CardTitle>Original job</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">Job *</label>
              <Select value={jobId} onValueChange={setJobId}>
                <SelectTrigger>
                  <SelectValue placeholder={selectedJob ? `${selectedJob.title} — ${selectedJob.number}` : "Select a completed job…"} />
                </SelectTrigger>
                <SelectContent>
                  {jobs.map((j) => {
                    const c = customerMap.get(j.customerId);
                    return (
                      <SelectItem key={j.id} value={j.id}>
                        {j.number} · {j.title}
                        {c?.name ? ` — ${c.name}` : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Complaint</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">Summary</label>
              <Input
                value={complaintSummary}
                onChange={(e) => setComplaintSummary(e.target.value)}
                placeholder="Short one-line description of the problem"
                maxLength={500}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">Details</label>
              <Textarea
                value={complaintDetails}
                onChange={(e) => setComplaintDetails(e.target.value)}
                placeholder="What the customer reported and when…"
                rows={3}
                maxLength={5000}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Classification</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">Intake reason</label>
              <Select value={intakeReason} onValueChange={(v) => setIntakeReason(v as ComebackIntakeReason)}>
                <SelectTrigger><SelectValue placeholder="Optional — choose reason" /></SelectTrigger>
                <SelectContent>
                  {(COMEBACK_INTAKE_REASON as readonly string[]).map((v) => (
                    <SelectItem key={v} value={v}>{COMEBACK_INTAKE_REASON_LABEL[v as ComebackIntakeReason]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">Severity</label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as ComebackSeverity)}>
                <SelectTrigger><SelectValue placeholder="Optional — default LOW" /></SelectTrigger>
                <SelectContent>
                  {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const).map((v) => (
                    <SelectItem key={v} value={v}>{COMEBACK_SEVERITY_LABEL[v]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isLoading || !jobId}>
            {isLoading ? "Submitting…" : "Submit comeback"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}