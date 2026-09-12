"use client";

import { useMemo, useState } from "react";
import { useImportCustomersMutation } from "@/lib/redux/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { InfoTip } from "@/components/ui/info-tip";

const FIELD_SEP = "|";

type ParsedRow = {
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
  raw: string;
  error?: string;
};

function parseCustomerLine(line: string): ParsedRow {
  const parts = line.split("|").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { name: "", raw: line, error: "empty line" };
  const [name, phone, email, notes] = parts as [string, string?, string?, string?];
  if (!name) return { name: "", raw: line, error: "missing name" };
  return { name, phone, email, notes, raw: line };
}

function parseRows(text: string): ParsedRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseCustomerLine);
}

/**
 * Bulk-create customers from pasted paper records. One per line, fields
 * separated by "|":  Name | phone | email | notes.
 */
export default function CustomerImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [importCustomers, { isLoading }] = useImportCustomersMutation();

  const rows = useMemo(() => parseRows(text), [text]);
  const valid = rows.filter((r) => !r.error);
  const invalid = rows.filter((r) => r.error);

  const reset = () => {
    setText("");
    setResult(null);
  };

  const handleSubmit = async () => {
    try {
      const res = await importCustomers({
        customers: valid.map(({ name, phone, email, notes }) => ({
          name,
          ...(phone ? { phone } : {}),
          ...(email ? { email } : {}),
          ...(notes ? { notes } : {}),
        })),
      }).unwrap();
      const created = res.created?.length ?? 0;
      const skipped = res.skipped?.length ?? 0;
      setResult(`Imported ${created} customer${created === 1 ? "" : "s"}${skipped ? `, ${skipped} skipped` : ""}.`);
      if (created > 0 || res.skipped?.length) {
        setText("");
      }
    } catch {
      setResult("Import failed. Check the lines and try again.");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogHeader>
        <DialogTitle>Import customers</DialogTitle>
      </DialogHeader>
      <DialogContent>
        <div className="flex flex-col gap-2 text-xs text-fg-muted">
          <p>
            Paste your customers below, one per line. Separate fields with{" "}
            <code className="px-1 rounded bg-surface-300 text-fg">&nbsp;|&nbsp;</code>:
          </p>
          <pre className="rounded-lg border border-border bg-surface-300 px-3 py-2 text-[11px] text-fg leading-relaxed overflow-x-auto">
            {`John Doe | 237681402886 | john@example.com
Grace Nkong | 237676494295
Smith Tanka | | smith@mm.com | works at warehouse`}
          </pre>
          <p className="flex items-center gap-1.5">
            Customers whose phone or email already exist in your list will be skipped.
            <InfoTip label="How duplicates are handled">
              A customer is skipped if their phone or email already belongs to another
              customer in your organization. Use apostrophes in names — no other punctuation is needed.
            </InfoTip>
          </p>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"John Doe | 237681402886 | john@example.com\nGrace Nkong | 237676494295"}
          className="mt-2 min-h-[150px] px-3 py-2 rounded-lg border border-border bg-surface-300 text-fg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 resize-y font-mono"
          data-tour="customer-import-input"
        />

        {(!rows.length || invalid.length > 0) && text.trim() && (
          <p className="text-xs text-amber">
            {rows.length === 0
              ? "No lines parsed yet."
              : `${invalid.length} line${invalid.length === 1 ? "" : "s"} need attention`}
          </p>
        )}

        {rows.length > 0 && (
          <div className="mt-1">
            <p className="text-xs text-fg-muted">
              <span className="font-semibold text-fg">{valid.length}</span> ready to import
              {invalid.length > 0 && (
                <>
                  {" "}· <span className="text-amber">{invalid.length} invalid</span>
                </>
              )}
            </p>
            {invalid.length > 0 && (
              <div className="mt-2 max-h-24 overflow-y-auto rounded-lg border border-border bg-surface-300 p-2 text-[11px] text-fg-muted">
                {invalid.slice(0, 20).map((r, i) => (
                  <p key={i} className="truncate">
                    <span className="text-amber">Line {i + 1}:</span> {r.raw} — {r.error}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {result && (
          <p className="text-xs text-emerald" data-tour="customer-import-result">
            {result}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" disabled={isLoading} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            loading={isLoading}
            disabled={valid.length === 0}
            onClick={handleSubmit}
            data-tour="customer-import-submit"
          >
            Import {valid.length > 0 ? `${valid.length} customer${valid.length === 1 ? "" : "s"}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}