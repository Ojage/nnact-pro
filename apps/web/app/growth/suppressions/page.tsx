"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  GROWTH_SUPPRESSION_REASON,
  GROWTH_SUPPRESSION_REASON_LABELS,
  GROWTH_SUPPRESSION_SCOPE,
  type GrowthSuppressionReason,
  type GrowthSuppressionScope,
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
import { EmptyState } from "@/components/empty-state";
import {
  useCreateGrowthSuppressionMutation,
  useDeleteGrowthSuppressionMutation,
  useGrowthSuppressionsQuery,
  explainRtkError,
} from "@/lib/redux/api";
import { useSessionUser } from "@/lib/use-session-user";

export default function GrowthSuppressionsPage() {
  const { user } = useSessionUser();
  const canWrite = user?.role === "owner" || user?.role === "dispatcher";
  const { data: suppressions = [], isLoading } = useGrowthSuppressionsQuery();
  const [scope, setScope] = useState<string>("EMAIL");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState<string>("OPT_OUT");
  const [note, setNote] = useState("");

  const [createSuppression, { isLoading: creating }] = useCreateGrowthSuppressionMutation();
  const [deleteSuppression] = useDeleteGrowthSuppressionMutation();

  async function submit() {
    if (!value.trim()) {
      toast.error("A value is required");
      return;
    }
    try {
      await createSuppression({
        scope: scope as GrowthSuppressionScope,
        value: value.trim(),
        reason: reason as GrowthSuppressionReason,
        note: note.trim() || null,
      }).unwrap();
      toast.success("Added to the suppression list");
      setValue("");
      setNote("");
    } catch (error) {
      toast.error(explainRtkError(error, "Could not add to the suppression list"));
    }
  }

  async function remove(id: string) {
    try {
      await deleteSuppression(id).unwrap();
      toast.success("Removed from the suppression list");
    } catch (error) {
      toast.error(explainRtkError(error, "Could not remove the entry"));
    }
  }

  return (
    <div>
      <PageHeader
        title="Suppression List"
        description="Opt-outs, bounces and blocked contacts. Entries are checked immediately before every send, so adding one here stops outreach even if a campaign was already queued."
      />

      {canWrite ? (
        <Card className="mb-6">
          <CardContent className="space-y-3 p-4">
            <h2 className="text-sm font-semibold text-fg">Add an entry</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GROWTH_SUPPRESSION_SCOPE.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value.toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Email, domain, phone or company"
              />
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GROWTH_SUPPRESSION_REASON.map((value) => (
                    <SelectItem key={value} value={value}>
                      {GROWTH_SUPPRESSION_REASON_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="suppressionNote">Note</Label>
              <Input
                id="suppressionNote"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional context"
              />
            </div>
            <Button onClick={submit} disabled={creating}>
              {creating ? "Saving…" : "Add entry"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : suppressions.length === 0 ? (
        <EmptyState
          title="Nothing suppressed"
          description="Opt-outs recorded by inbound mail and bounces are added here automatically."
        />
      ) : (
        <div className="space-y-2">
          {suppressions.map((entry) => (
            <Card key={entry.id}>
              <CardContent className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">{entry.value}</p>
                  <p className="text-xs text-fg-muted">
                    {entry.scope.toLowerCase()} · {GROWTH_SUPPRESSION_REASON_LABELS[entry.reason]}
                    {entry.note ? ` · ${entry.note}` : ""}
                  </p>
                </div>
                {canWrite ? (
                  <Button size="sm" variant="ghost" onClick={() => remove(entry.id)}>
                    Remove
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
