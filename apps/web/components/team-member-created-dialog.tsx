"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { formatTeamMemberLoginMessage } from "@nnact/shared";
import type { CreateTeamMemberResponseDTO } from "@nnact/shared";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  document.body.removeChild(area);
}

export function TeamMemberCreatedDialog({
  open,
  result,
  onClose,
}: {
  open: boolean;
  result: CreateTeamMemberResponseDTO | null;
  onClose: () => void;
}) {
  const [copiedField, setCopiedField] = useState<"password" | "message" | null>(null);

  if (!result) return null;

  const loginMessage = formatTeamMemberLoginMessage(result.user.email, result.temporaryPassword);

  async function handleCopy(field: "password" | "message", text: string) {
    await copyText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg gap-4">
        <DialogHeader>
          <DialogTitle>Team member added</DialogTitle>
          <DialogDescription>
            Share these sign-in details with {result.user.name}. They must set a new password on first login.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-xl border border-border bg-surface-200 p-4 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-fg-dim">Email</p>
              <p className="mt-1 font-medium text-fg">{result.user.email}</p>
            </div>
          </div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-fg-dim">Temporary password</p>
              <p className="mt-1 font-mono text-base font-semibold text-fg">{result.temporaryPassword}</p>
              <p className="mt-1 text-xs text-fg-muted">Format: firstname@{new Date().getFullYear()}</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="shrink-0"
              onClick={() => void handleCopy("password", result.temporaryPassword)}
            >
              {copiedField === "password" ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copiedField === "password" ? "Copied" : "Copy password"}
            </Button>
          </div>
          <div className="rounded-lg border border-dashed border-border bg-surface-100 p-3 text-xs text-fg-muted whitespace-pre-wrap">
            {loginMessage}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleCopy("message", loginMessage)}
          >
            {copiedField === "message" ? (
              <>
                <Check className="size-4" />
                Copied message
              </>
            ) : (
              <>
                <Copy className="size-4" />
                Copy for WhatsApp / SMS
              </>
            )}
          </Button>
          <Button type="button" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
