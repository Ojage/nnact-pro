"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  GROWTH_CAMPAIGN_STATUS_LABELS,
  GROWTH_OUTBOUND_STATUS_LABELS,
  type GrowthOutboundStatus,
} from "@nnact/shared";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  useApproveGrowthCampaignMutation,
  useGrowthCampaignPreviewQuery,
  useGrowthCampaignQuery,
  useGrowthCampaignRecipientsQuery,
  useGrowthOutboundLogQuery,
  usePauseGrowthCampaignMutation,
  useRunGrowthCampaignMutation,
  useSaveGrowthCampaignStepMutation,
  useScheduleGrowthCampaignMutation,
  useStopGrowthRecipientMutation,
  useSubmitGrowthCampaignReviewMutation,
  explainRtkError,
} from "@/lib/redux/api";
import { useSessionUser } from "@/lib/use-session-user";

export default function GrowthCampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useSessionUser();
  const isOwner = user?.role === "owner";
  const canWrite = isOwner || user?.role === "dispatcher";

  const { data, isLoading } = useGrowthCampaignQuery(id ?? "");
  const { data: preview } = useGrowthCampaignPreviewQuery(id ?? "", { skip: !id });
  const { data: recipients } = useGrowthCampaignRecipientsQuery({ id: id ?? "" }, { skip: !id });
  const { data: outbound } = useGrowthOutboundLogQuery({ id: id ?? "" }, { skip: !id });

  const [submitReview] = useSubmitGrowthCampaignReviewMutation();
  const [approve] = useApproveGrowthCampaignMutation();
  const [schedule] = useScheduleGrowthCampaignMutation();
  const [pause] = usePauseGrowthCampaignMutation();
  const [run] = useRunGrowthCampaignMutation();
  const [saveStep] = useSaveGrowthCampaignStepMutation();
  const [stopRecipient] = useStopGrowthRecipientMutation();
  const [busy, setBusy] = useState(false);

  const [stepNumber, setStepNumber] = useState("1");
  const [delayDays, setDelayDays] = useState("0");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!data?.campaign) {
    return (
      <div>
        <PageHeader title="Campaign not found" />
        <Button variant="outline" asChild>
          <Link href="/growth/campaigns">Back to campaigns</Link>
        </Button>
      </div>
    );
  }

  const campaign = data.campaign;
  const senderReady = data.sender?.verificationState === "VERIFIED";
  const coldSenderReady = senderReady && data.sender?.coldApproved === true;
  const isCold = campaign.purpose === "COLD_OUTREACH";
  const editable =
    campaign.status === "DRAFT" ||
    campaign.status === "RESEARCHING" ||
    campaign.status === "READY_FOR_REVIEW" ||
    campaign.status === "IN_REVIEW";

  async function act(label: string, fn: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    try {
      await fn();
      if (after) after();
    } catch (error) {
      toast.error(explainRtkError(error, `Could not ${label}`));
    } finally {
      setBusy(false);
    }
  }

  function reportRun(result: { sent: number; suppressed: number; blocked: number; skipped: number; failed: number; duplicates: number; refusal?: { code: string; message: string } }) {
    if (result.refusal) {
      toast.error(`${result.refusal.code}: ${result.refusal.message}`);
      return;
    }
    const parts = [
      `${result.sent} sent`,
      `${result.suppressed} suppressed`,
      `${result.blocked} blocked`,
      `${result.skipped} skipped`,
      `${result.failed} failed`,
    ];
    if (result.duplicates > 0) parts.push(`${result.duplicates} already recorded`);
    toast.success(parts.join(", "));
  }

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title={campaign.name}
        description={`${GROWTH_CAMPAIGN_STATUS_LABELS[campaign.status]} · ${campaign.dailyLimit} a day · ${campaign.maxFollowUps} follow-ups`}
        actions={
          <Button variant="outline" asChild>
            <Link href="/growth/campaigns">Back</Link>
          </Button>
        }
      />

      {isCold ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-300">
          Cold outreach. It will not run until a compliant cold transport is configured, and the sender
          identity needs owner approval for cold use. It never uses the Resend connection.
          {preview ? ` Transport: ${preview.coldTransportReady ? "cold SMTP configured" : "not configured — sends blocked"}.` : ""}
        </p>
      ) : null}

      {preview?.samples?.length ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <h2 className="text-sm font-semibold text-fg">Send preview (sample recipients)</h2>
            <p className="text-xs text-fg-muted">
              {preview.approvedFactCount} approved knowledge facts available for AI drafts · timezone{" "}
              {preview.campaign.timezone}
            </p>
            {preview.samples.map((s) => (
              <div key={s.recipientId} className="rounded-md border border-border p-3 text-sm">
                <p className="font-medium">
                  {s.companyName} {s.city ? `· ${s.city}` : ""}
                </p>
                {s.rendered ? (
                  <>
                    <p className="text-xs text-fg-muted">From: {s.rendered.from}</p>
                    <p className="text-xs text-fg-muted">To: {s.to}</p>
                    <p className="text-xs text-fg-muted">Reply-To: {s.rendered.replyTo}</p>
                    <p className="mt-2 font-medium">{s.rendered.subject}</p>
                    <pre className="mt-1 whitespace-pre-wrap text-xs text-fg-muted">{s.rendered.bodyText}</pre>
                  </>
                ) : (
                  <p className="text-amber-700 dark:text-amber-400">{s.warning ?? "No preview"}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="text-sm font-semibold text-fg">Sender</h2>
          {data.sender ? (
            <div className="space-y-1 text-sm">
              <p className="text-fg">
                {data.sender.displayName} · {data.sender.email}
              </p>
              <p className="text-xs text-fg-muted">
                Verification: {data.sender.verificationState.toLowerCase()}
                {isCold ? ` · cold approved: ${data.sender.coldApproved ? "yes" : "no"}` : ""}
              </p>
              {!senderReady ? (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  This identity is not verified, so nothing can be sent from it.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-fg-muted">Sender identity missing.</p>
          )}

          <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs text-fg-dim">Enrolled</p>
              <p className="text-fg">{data.recipients.total}</p>
            </div>
            <div>
              <p className="text-xs text-fg-dim">Sent</p>
              <p className="text-fg">{data.recipients.sent}</p>
            </div>
            <div>
              <p className="text-xs text-fg-dim">Suppressed</p>
              <p className="text-fg">{data.recipients.suppressed}</p>
            </div>
            <div>
              <p className="text-xs text-fg-dim">Sent today</p>
              <p className="text-fg">
                {data.sentToday} / {data.dailyLimit}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {canWrite ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <h2 className="text-sm font-semibold text-fg">Move it along</h2>
            <div className="flex flex-wrap gap-2">
              {campaign.status === "DRAFT" || campaign.status === "RESEARCHING" ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    act("submit it for review", () => submitReview(campaign.id).unwrap(), () =>
                      toast.success("Sent for review"),
                    )
                  }
                >
                  Submit for review
                </Button>
              ) : null}

              {campaign.status === "IN_REVIEW" ? (
                <Button
                  size="sm"
                  disabled={busy || !isOwner}
                  title={isOwner ? undefined : "Only an owner can approve outreach"}
                  onClick={() =>
                    act("approve it", () => approve(campaign.id).unwrap(), () => toast.success("Approved"))
                  }
                >
                  Approve
                </Button>
              ) : null}

              {campaign.status === "APPROVED" || campaign.status === "PAUSED" ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    act("schedule it", () => schedule({ id: campaign.id }).unwrap(), () =>
                      toast.success("Scheduled"),
                    )
                  }
                >
                  Schedule
                </Button>
              ) : null}

              {campaign.status === "SCHEDULED" || campaign.status === "RUNNING" ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => act("pause it", () => pause(campaign.id).unwrap())}
                >
                  Pause
                </Button>
              ) : null}

              {campaign.status === "SCHEDULED" || campaign.status === "RUNNING" ? (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    act("run it", () =>
                      run({ id: campaign.id, limit: 50 }).unwrap().then((result) => {
                        reportRun(result);
                      }),
                    )
                  }
                >
                  Run now
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-fg-muted">
              Each run re-checks approval, the transport, the daily limit, quiet hours, suppression and
              every stop signal. Revoking approval or removing the cold transport stops it mid-flight.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {canWrite && editable ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <h2 className="text-sm font-semibold text-fg">Message</h2>
            {campaign.status === "DRAFT" ? (
              <p className="text-xs text-fg-muted">
                Step 1 is the first message. Later steps are follow-ups; give each one a delay in days.
                Saving the same step number replaces it, so you can revise wording before approving.
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <Label htmlFor="stepNumber">Step</Label>
                <Input
                  id="stepNumber"
                  type="number"
                  min={1}
                  value={stepNumber}
                  onChange={(e) => setStepNumber(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="delayDays">Delay (days)</Label>
                <Input
                  id="delayDays"
                  type="number"
                  min={0}
                  value={delayDays}
                  onChange={(e) => setDelayDays(e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="subject">Subject</Label>
                <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
            </div>
            <div>
              <Label htmlFor="bodyText">Body</Label>
              <Textarea
                id="bodyText"
                rows={6}
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              disabled={busy || !subject.trim() || !bodyText.trim()}
              onClick={() =>
                act("save the step", async () => {
                  await saveStep({
                    id: campaign.id,
                    data: {
                      stepNumber: Number(stepNumber) || 1,
                      delayDays: Number(delayDays) || 0,
                      subject: subject.trim(),
                      bodyText: bodyText.trim(),
                    },
                  }).unwrap();
                  setSubject("");
                  setBodyText("");
                })
              }
            >
              Save step
            </Button>

            {data.steps.length > 0 ? (
              <ul className="space-y-2 border-t border-border pt-3">
                {data.steps.map((step) => (
                  <li key={step.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-fg">Step {step.stepNumber}</span>
                      <span className="text-xs text-fg-dim">
                        {step.delayDays === 0 ? "no delay" : `after ${step.delayDays} day(s)`}
                      </span>
                    </div>
                    <p className="text-sm text-fg-muted">{step.subject}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="text-sm font-semibold text-fg">Recipients</h2>
          {(recipients ?? []).length === 0 ? (
            <p className="text-sm text-fg-muted">
              Nobody enrolled yet. Add contacts from a prospect record.
            </p>
          ) : (
            <ul className="space-y-2">
              {(recipients ?? []).map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm text-fg">
                      {r.companyName} · {r.contactValue}
                    </p>
                    <p className="text-xs text-fg-dim">
                      {r.status.toLowerCase().replace(/_/g, " ")}
                      {r.currentStep > 0 ? ` · step ${r.currentStep}` : ""}
                      {r.followUpsSent > 0 ? ` · ${r.followUpsSent} follow-up(s)` : ""}
                    </p>
                  </div>
                  {canWrite && r.status !== "REPLIED" && r.status !== "OPTED_OUT" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        act("stop this thread", async () => {
                          await stopRecipient({ id: r.id }).unwrap();
                          toast.success("Stopped");
                        })
                      }
                    >
                      Stop
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="text-sm font-semibold text-fg">Outbound log</h2>
          <p className="text-xs text-fg-muted">
            Every attempt is recorded, refusals included, so a send that did not happen can be explained
            after the fact.
          </p>
          {(outbound ?? []).length === 0 ? (
            <p className="text-sm text-fg-muted">Nothing attempted yet.</p>
          ) : (
            <ul className="space-y-2">
              {(outbound ?? []).map((message) => (
                <li key={message.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-fg">{message.toEmail}</span>
                    <span className="text-xs text-fg-dim">
                      {GROWTH_OUTBOUND_STATUS_LABELS[message.status as GrowthOutboundStatus] ??
                        message.status}
                    </span>
                  </div>
                  <p className="text-xs text-fg-muted">{message.subject}</p>
                  <p className="mt-1 text-xs text-fg-dim">
                    {message.transportId}
                    {message.blockedReason ? ` · ${message.blockedReason}` : ""}
                    {message.error ? ` · ${message.error}` : ""}
                    {message.sentAt ? ` · ${new Date(message.sentAt).toLocaleString()}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
