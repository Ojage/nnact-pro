"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  GROWTH_CONTACT_DETAIL_KIND,
  GROWTH_PROSPECT_LIFECYCLE,
  type GrowthContactDetailKind,
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
  useAddGrowthContactMutation,
  useGrowthProspectQuery,
  useMergeGrowthProspectMutation,
  useUpdateGrowthProspectMutation,
  explainRtkError,
} from "@/lib/redux/api";
import { useSessionUser } from "@/lib/use-session-user";

export default function GrowthProspectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useSessionUser();
  const canWrite = user?.role === "owner" || user?.role === "dispatcher";
  const { data: prospect, isLoading } = useGrowthProspectQuery(id ?? "");
  const [updateProspect] = useUpdateGrowthProspectMutation();
  const [addContact] = useAddGrowthContactMutation();
  const [mergeProspect] = useMergeGrowthProspectMutation();

  const [kind, setKind] = useState<GrowthContactDetailKind>("EMAIL");
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [source, setSource] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [mergeInto, setMergeInto] = useState("");

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!prospect) {
    return (
      <div>
        <PageHeader title="Prospect not found" />
        <Button variant="outline" asChild>
          <Link href="/growth">Back to prospects</Link>
        </Button>
      </div>
    );
  }

  async function changeLifecycle(next: string) {
    try {
      await updateProspect({ id: prospect!.id, data: { lifecycle: next } }).unwrap();
    } catch (error) {
      toast.error(explainRtkError(error, "Could not update the prospect"));
    }
  }

  async function submitContact() {
    if (!value.trim()) {
      toast.error("A value is required");
      return;
    }
    try {
      await addContact({
        id: prospect!.id,
        data: {
          kind,
          value: value.trim(),
          label: label.trim() || null,
          source: source.trim() || null,
          sourceUrl: sourceUrl.trim() || null,
        },
      }).unwrap();
      setValue("");
      setLabel("");
      setSource("");
      setSourceUrl("");
      toast.success("Contact added");
    } catch (error) {
      toast.error(explainRtkError(error, "Could not add the contact"));
    }
  }

  async function submitMerge() {
    if (!mergeInto.trim()) {
      toast.error("Enter the id of the record to merge into");
      return;
    }
    try {
      await mergeProspect({ id: prospect!.id, intoId: mergeInto.trim() }).unwrap();
      toast.success("Merged");
      router.push(`/growth/${mergeInto.trim()}`);
    } catch (error) {
      toast.error(explainRtkError(error, "Could not merge"));
    }
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={prospect.companyName}
        description={[prospect.websiteDomain, prospect.industry, prospect.city, prospect.country]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <Button variant="outline" asChild>
            <Link href="/growth">Back</Link>
          </Button>
        }
      />

      <div className="space-y-6">
        <Card>
          <CardContent className="space-y-3 p-4">
            <h2 className="text-sm font-semibold text-fg">Research</h2>
            {canWrite ? (
              <div className="max-w-xs">
                <Select value={prospect.lifecycle} onValueChange={changeLifecycle}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GROWTH_PROSPECT_LIFECYCLE.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value.toLowerCase().replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {prospect.equipmentNeeds ? (
              <div>
                <p className="text-xs font-medium text-fg-muted">Equipment or service need</p>
                <p className="text-sm text-fg">{prospect.equipmentNeeds}</p>
              </div>
            ) : null}
            {prospect.notes ? (
              <div>
                <p className="text-xs font-medium text-fg-muted">Notes</p>
                <p className="text-sm text-fg">{prospect.notes}</p>
              </div>
            ) : null}
            <p className="text-xs text-fg-dim">
              Source: {prospect.source.toLowerCase().replace(/_/g, " ")}
              {prospect.sourceDetail ? ` · ${prospect.sourceDetail}` : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-4">
            <h2 className="text-sm font-semibold text-fg">Contact details</h2>
            {(prospect.contacts ?? []).length === 0 ? (
              <p className="text-sm text-fg-muted">No contact details recorded yet.</p>
            ) : (
              <ul className="space-y-2">
                {(prospect.contacts ?? []).map((contact) => (
                  <li key={contact.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-fg">{contact.value}</span>
                      <span className="text-xs text-fg-dim">{contact.kind.toLowerCase()}</span>
                    </div>
                    {contact.label ? (
                      <p className="text-xs text-fg-muted">{contact.label}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-fg-dim">
                      {contact.source ? `From ${contact.source}` : "Source not recorded"}
                      {contact.sourceUrl ? ` · ${contact.sourceUrl}` : ""}
                      {contact.sourceDate ? ` · ${new Date(contact.sourceDate).toLocaleDateString()}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {canWrite ? (
              <div className="space-y-3 border-t border-border pt-3">
                <p className="text-xs font-medium text-fg-muted">Add a contact detail</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <Select value={kind} onValueChange={(v) => setKind(v as GrowthContactDetailKind)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GROWTH_CONTACT_DETAIL_KIND.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value.toLowerCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="sm:col-span-3">
                    <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value" />
                  </div>
                  <div>
                    <Input
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder="Role"
                    />
                  </div>
                  <div>
                    <Input
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                      placeholder="Source"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Input
                      value={sourceUrl}
                      onChange={(e) => setSourceUrl(e.target.value)}
                      placeholder="Where it was found"
                    />
                  </div>
                </div>
                <Button size="sm" onClick={submitContact}>
                  Add contact
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {canWrite ? (
          <Card>
            <CardContent className="space-y-3 p-4">
              <h2 className="text-sm font-semibold text-fg">Merge into another record</h2>
              <p className="text-xs text-fg-muted">
                Moves the contact details above onto another prospect. This record is kept for audit but
                hidden from lists.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-64 flex-1">
                  <Label htmlFor="mergeInto">Target prospect id</Label>
                  <Input
                    id="mergeInto"
                    value={mergeInto}
                    onChange={(e) => setMergeInto(e.target.value)}
                    placeholder="uuid"
                  />
                </div>
                <Button variant="outline" onClick={submitMerge}>
                  Merge
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
