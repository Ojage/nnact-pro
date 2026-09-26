"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  GROWTH_SENDER_VERIFICATION_LABELS,
  type GrowthSenderIdentityDTO,
} from "@nnact/shared";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import {
  useApproveGrowthSenderColdMutation,
  useCreateGrowthSenderMutation,
  useGrowthSenderHealthQuery,
  useGrowthSendersQuery,
  useRevokeGrowthSenderColdMutation,
  useVerifyGrowthSenderMutation,
  explainRtkError,
} from "@/lib/redux/api";
import { useSessionUser } from "@/lib/use-session-user";

function VerificationPill({ state }: { state: GrowthSenderIdentityDTO["verificationState"] }) {
  const verified = state === "VERIFIED";
  const tone = verified
    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
    : state === "REVOKED" || state === "FAILED"
      ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
      : "bg-amber-500/10 text-amber-600 dark:text-amber-400";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {GROWTH_SENDER_VERIFICATION_LABELS[state]}
    </span>
  );
}

export default function GrowthSendersPage() {
  const { user } = useSessionUser();
  const isOwner = user?.role === "owner";
  const { data: senders = [], isLoading } = useGrowthSendersQuery();
  const { data: health } = useGrowthSenderHealthQuery();
  const [showForm, setShowForm] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [verifyMethod, setVerifyMethod] = useState("DNS TXT");
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const [createSender, { isLoading: creating }] = useCreateGrowthSenderMutation();
  const [verifySender] = useVerifyGrowthSenderMutation();
  const [approveCold] = useApproveGrowthSenderColdMutation();
  const [revokeCold] = useRevokeGrowthSenderColdMutation();

  async function submit() {
    if (!displayName.trim() || !email.trim()) {
      toast.error("A name and a real inbox are required");
      return;
    }
    try {
      await createSender({
        displayName: displayName.trim(),
        email: email.trim(),
        roleTitle: roleTitle.trim() || null,
      }).unwrap();
      toast.success("Sender added — it still needs verification");
      setDisplayName("");
      setEmail("");
      setRoleTitle("");
      setShowForm(false);
    } catch (error) {
      toast.error(explainRtkError(error, "Could not add the sender"));
    }
  }

  async function verify(sender: GrowthSenderIdentityDTO) {
    try {
      await verifySender({ id: sender.id, method: verifyMethod }).unwrap();
      toast.success("Sender verified");
      setVerifyingId(null);
    } catch (error) {
      toast.error(explainRtkError(error, "Could not verify the sender"));
    }
  }

  async function toggleCold(sender: GrowthSenderIdentityDTO) {
    try {
      if (sender.coldApproved) {
        await revokeCold({ id: sender.id }).unwrap();
        toast.success("Cold outreach approval removed");
      } else {
        await approveCold({ id: sender.id }).unwrap();
        toast.success("Approved for cold outreach");
      }
    } catch (error) {
      toast.error(explainRtkError(error, "Could not change the cold approval"));
    }
  }

  return (
    <div>
      <PageHeader
        title="Sender Registry"
        description="Only real, verified inboxes can send. A sender must be verified before an owner can approve it for cold outreach."
        actions={
          <Button variant={showForm ? "outline" : "default"} onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "Add sender"}
          </Button>
        }
      />

      {health ? (
        <p className="mb-4 text-sm text-fg-muted">
          Sender health (30 days): cold transport{" "}
          <span className={health.coldTransportReady ? "text-emerald-600" : "text-amber-600"}>
            {health.coldTransportReady ? "configured" : "not configured"}
          </span>
        </p>
      ) : null}

      {showForm ? (
        <Card className="mb-6">
          <CardContent className="space-y-3 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="displayName">Name of the person</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Dana Reeves"
                />
              </div>
              <div>
                <Label htmlFor="senderEmail">Their real inbox</Label>
                <Input
                  id="senderEmail"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="dana@nnact.com"
                />
              </div>
              <div>
                <Label htmlFor="roleTitle">Role</Label>
                <Input
                  id="roleTitle"
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                  placeholder="Owner"
                />
              </div>
            </div>
            <p className="text-xs text-fg-muted">
              Use an inbox the business really controls. Replies must reach a person who can answer.
            </p>
            <Button onClick={submit} disabled={creating}>
              {creating ? "Saving…" : "Add sender"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : senders.length === 0 ? (
        <EmptyState
          title="No sender identities yet"
          description="Add the inboxes your business controls before any outreach is sent."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {senders.map((sender) => {
            const healthRow = health?.senders.find((h) => h.senderId === sender.id);
            return (
            <Card key={sender.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-fg">{sender.displayName}</p>
                    <p className="truncate text-xs text-fg-muted">{sender.email}</p>
                  </div>
                  <VerificationPill state={sender.verificationState} />
                </div>

                <div className="space-y-1 text-xs text-fg-muted">
                  {sender.roleTitle ? <p>{sender.roleTitle}</p> : null}
                  {sender.verificationMethod ? (
                    <p>
                      Verified via {sender.verificationMethod}
                      {sender.verifiedAt ? ` · ${new Date(sender.verifiedAt).toLocaleDateString()}` : ""}
                    </p>
                  ) : null}
                  <p>
                    Cold outreach:{" "}
                    {sender.coldApproved ? (
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">approved</span>
                    ) : (
                      "not approved"
                    )}
                  </p>
                </div>

                {sender.verificationState !== "VERIFIED" ? (
                  isOwner ? (
                    verifyingId === sender.id ? (
                      <div className="space-y-2">
                        <Label htmlFor={`method-${sender.id}`}>How was control proven?</Label>
                        <Input
                          id={`method-${sender.id}`}
                          value={verifyMethod}
                          onChange={(e) => setVerifyMethod(e.target.value)}
                        />
                        <Button size="sm" onClick={() => verify(sender)}>
                          Record verification
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setVerifyingId(sender.id)}>
                        Verify inbox
                      </Button>
                    )
                  ) : (
                    <p className="text-xs text-fg-dim">Only an owner can verify a sender.</p>
                  )
                ) : isOwner ? (
                  <Button
                    size="sm"
                    variant={sender.coldApproved ? "outline" : "default"}
                    onClick={() => toggleCold(sender)}
                  >
                    {sender.coldApproved ? "Remove cold approval" : "Approve for cold outreach"}
                  </Button>
                ) : (
                  <p className="text-xs text-fg-dim">
                    Cold outreach approval is an owner decision.
                  </p>
                )}
                {healthRow ? (
                  <div className="border-t border-border pt-2 text-xs text-fg-muted">
                    <p>
                      30d: {healthRow.sent30d} sent · {healthRow.failed30d} failed · {healthRow.blocked30d}{" "}
                      blocked
                    </p>
                    {healthRow.alerts.map((a) => (
                      <p key={a} className="text-amber-700 dark:text-amber-400">
                        {a}
                      </p>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
