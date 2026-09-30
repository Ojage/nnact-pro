"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  GROWTH_CAMPAIGN_PURPOSE,
  GROWTH_CAMPAIGN_PURPOSE_LABELS,
  GROWTH_CAMPAIGN_STATUS,
  GROWTH_CAMPAIGN_STATUS_LABELS,
  type GrowthCampaignPurpose,
  type GrowthCampaignStatus,
} from "@nnact/shared";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateGrowthCampaignMutation,
  useGrowthCampaignsQuery,
  useGrowthSendersQuery,
  explainRtkError,
} from "@/lib/redux/api";
import { useSessionUser } from "@/lib/use-session-user";

const STATUS_STYLES: Partial<Record<GrowthCampaignStatus, string>> = {
  DRAFT: "bg-bg-muted text-fg-muted",
  IN_REVIEW: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  APPROVED: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  SCHEDULED: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  RUNNING: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  PAUSED: "bg-bg-muted text-fg-muted",
  COMPLETED: "bg-bg-muted text-fg-dim",
  CANCELLED: "bg-bg-muted text-fg-dim",
};

export default function GrowthCampaignsPage() {
  const { user } = useSessionUser();
  const canWrite = user?.role === "owner" || user?.role === "dispatcher";
  const { data: campaigns, isLoading } = useGrowthCampaignsQuery();
  const { data: senders } = useGrowthSendersQuery();
  const [createCampaign] = useCreateGrowthCampaignMutation();

  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState<GrowthCampaignPurpose>("PERMISSION_MARKETING");
  const [senderIdentityId, setSenderIdentityId] = useState("");
  // Must match the API and DB default (Africa/Douala). This form previously
  // pre-filled Africa/Johannesburg, so accepting the default quietly shifted
  // quiet hours by an hour versus every other campaign in the org.
  const [timezone, setTimezone] = useState("Africa/Douala");
  const [dailyLimit, setDailyLimit] = useState("50");
  const [maxFollowUps, setMaxFollowUps] = useState("2");
  const [saving, setSaving] = useState(false);

  // Only a verified, active identity can be attached to a campaign.
  const usableSenders = (senders ?? []).filter((s) => s.verificationState === "VERIFIED" && s.isActive);

  async function submit() {
    if (!name.trim()) {
      toast.error("A campaign name is required");
      return;
    }
    if (!senderIdentityId) {
      toast.error("Choose the sender this campaign sends from");
      return;
    }
    setSaving(true);
    try {
      // `Number(x) || fallback` silently rewrote an explicit 0 to the
      // fallback, so a daily limit of 0 (pause sending, keep the campaign)
      // became 50. Parse explicitly and let the API validate the range.
      const limit = Number.parseInt(dailyLimit, 10);
      const followUps = Number.parseInt(maxFollowUps, 10);
      if (!Number.isFinite(limit) || limit < 1) {
        toast.error("Daily limit must be at least 1");
        setSaving(false);
        return;
      }
      if (!Number.isFinite(followUps) || followUps < 0 || followUps > 10) {
        toast.error("Follow-ups must be between 0 and 10");
        setSaving(false);
        return;
      }
      await createCampaign({
        name: name.trim(),
        purpose,
        senderIdentityId,
        timezone: timezone.trim() || "Africa/Douala",
        dailyLimit: limit,
        maxFollowUps: followUps,
      }).unwrap();
      toast.success("Draft created");
      setName("");
      setSenderIdentityId("");
    } catch (error) {
      toast.error(explainRtkError(error, "Could not create the campaign"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        description="A draft cannot send. An owner has to approve it, and cold outreach needs an approved cold transport before it can be scheduled at all."
        actions={
          <Button variant="outline" asChild>
            <Link href="/growth">Prospects</Link>
          </Button>
        }
      />

      {canWrite ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <h2 className="text-sm font-semibold text-fg">New campaign</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="May workshop follow-ups"
                />
              </div>
              <div>
                <Label htmlFor="purpose">Purpose</Label>
                <Select value={purpose} onValueChange={(v) => setPurpose(v as GrowthCampaignPurpose)}>
                  <SelectTrigger id="purpose">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GROWTH_CAMPAIGN_PURPOSE.map((value) => (
                      <SelectItem key={value} value={value}>
                        {GROWTH_CAMPAIGN_PURPOSE_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="sender">Sender identity</Label>
                <Select value={senderIdentityId} onValueChange={setSenderIdentityId}>
                  <SelectTrigger id="sender">
                    <SelectValue placeholder={usableSenders.length ? "Choose" : "No verified sender"} />
                  </SelectTrigger>
                  <SelectContent>
                    {usableSenders.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.displayName} · {s.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="timezone">Quiet hours timezone</Label>
                <Input
                  id="timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="Africa/Douala"
                />
              </div>
              <div>
                <Label htmlFor="dailyLimit">Daily limit</Label>
                <Input
                  id="dailyLimit"
                  type="number"
                  min={1}
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="maxFollowUps">Follow-ups after the first</Label>
                <Input
                  id="maxFollowUps"
                  type="number"
                  min={0}
                  max={10}
                  value={maxFollowUps}
                  onChange={(e) => setMaxFollowUps(e.target.value)}
                />
              </div>
            </div>
            {purpose === "COLD_OUTREACH" ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Cold outreach will not schedule until a compliant cold transport is configured, and the
                sender identity must be cold-approved by an owner. It never uses the Resend connection.
              </p>
            ) : null}
            <Button onClick={submit} disabled={saving || usableSenders.length === 0}>
              {saving ? "Creating…" : "Create draft"}
            </Button>
            {usableSenders.length === 0 ? (
              <p className="text-xs text-fg-muted">
                No verified, active sender identity. Verify one on the sender registry first.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      ) : (campaigns ?? []).length === 0 ? (
        <p className="text-sm text-fg-muted">No campaigns yet.</p>
      ) : (
        <ul className="space-y-2">
          {(campaigns ?? []).map((campaign) => (
            <li key={campaign.id}>
              <Link
                href={`/growth/campaigns/${campaign.id}`}
                className="block rounded-xl border border-border p-4 transition-colors hover:border-fg-dim"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-fg">{campaign.name}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      STATUS_STYLES[campaign.status] ?? "bg-bg-muted text-fg-muted"
                    }`}
                  >
                    {GROWTH_CAMPAIGN_STATUS_LABELS[campaign.status] ?? campaign.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-fg-muted">
                  {GROWTH_CAMPAIGN_PURPOSE_LABELS[campaign.purpose]} · {campaign.dailyLimit} a day ·{" "}
                  {campaign.maxFollowUps} follow-ups · quiet hours {campaign.quietHoursStart}:00–
                  {campaign.quietHoursEnd}:00 {campaign.timezone}
                </p>
                {campaign.status === "SCHEDULED" && campaign.scheduledStartAt ? (
                  <p className="mt-1 text-xs text-fg-dim">
                    Starts {new Date(campaign.scheduledStartAt).toLocaleString()}
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
