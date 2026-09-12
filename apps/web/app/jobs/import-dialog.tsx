"use client";

import { useMemo, useState } from "react";
import type { CustomerDTO, JobStatus } from "@nnact/shared";
import { useImportJobsMutation } from "@/lib/redux/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { FormSelect } from "@/components/ui/form-select";
import { InfoTip } from "@/components/ui/info-tip";
import { Badge } from "@/components/ui/badge";

const FIELD_SEP = "|";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT_RE = /^[0-9]{1,9}$/;

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "completed", label: "Completed" },
  { value: "in_progress", label: "In progress" },
  { value: "scheduled", label: "Scheduled" },
  { value: "lead", label: "Lead" },
  { value: "canceled", label: "Canceled" },
];

type ParsedJob = {
  customerName: string;
  customerPhone?: string;
  title: string;
  date?: string;
  amount?: number;
  raw: string;
  error?: string;
  match?: CustomerDTO | null;
};

function parseJobLine(line: string, customers: CustomerDTO[]): ParsedJob {
  const parts = line.split(FIELD_SEP).map((p) => p.trim());
  if (parts.length === 0 || parts.every((p) => !p)) {
    return { customerName: "", title: "", raw: line, error: "empty line" };
  }
  const [customerName = "", title = "", date = "", amount = ""] = parts;
  if (!customerName) return { customerName: "", title, raw: line, error: "missing customer" };
  if (!title) return { customerName, title: "", raw: line, error: "missing job title" };

  if (date && !DATE_RE.test(date)) {
    return { customerName, title, date, raw: line, error: "date must be YYYY-MM-DD" };
  }
  const amountNum = amount ? Number(amount) : undefined;
  if (amount && (!AMOUNT_RE.test(amount) || !Number.isFinite(amountNum))) {
    return { customerName, title, date, raw: line, error: "amount must be a whole number (FCFA)" };
  }

  // Resolve against existing customers (phone, then email, then name) so the
  // preview can say whether this will reuse a record or create one.
  const qPhone = customerName.toLowerCase();
  const qEmail = customerName.toLowerCase();
  const qName = customerName.toLowerCase();
  const match =
    customers.find((c) => c.phone && c.phone.trim().toLowerCase() === qPhone) ??
    customers.find((c) => c.email && c.email.trim().toLowerCase() === qEmail) ??
    customers.find((c) => c.name.trim().toLowerCase() === qName) ??
    null;

  return {
    customerName,
    customerPhone: match?.phone ?? undefined,
    title,
    date: date || undefined,
    amount: amountNum,
    raw: line,
    match,
  };
}

function parseRows(text: string, customers: CustomerDTO[]): ParsedJob[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseJobLine(line, customers));
}

/**
 * Backfill historical paper jobs. One per line, fields separated by "|":
 * Customer | Job title | YYYY-MM-DD | Amount FCFA
 * The customer may be an existing one (matched by name/phone/email) or a brand
 * new one, which the import will create automatically.
 */
export default function JobImportDialog({
  open,
  onOpenChange,
  customers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: CustomerDTO[];
}) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState("completed");
  const [result, setResult] = useState<string | null>(null);
  const [importJobs, { isLoading }] = useImportJobsMutation();

  const rows = useMemo(() => parseRows(text, customers), [text, customers]);
  const valid = rows.filter((r) => !r.error);
  const invalid = rows.filter((r) => r.error);
  const newCustomers = valid.filter((r) => !r.match).length;

  const reset = () => {
    setText("");
    setResult(null);
    setStatus("completed");
  };

  const handleSubmit = async () => {
    try {
      const res = await importJobs({
        jobs: valid.map(({ customerName, customerPhone, title, date, amount, match }) => ({
          customerId: match?.id,
          customer: match ? undefined : { name: customerName, phone: customerPhone },
          title,
          date,
          status: status as JobStatus,
          total: amount !== undefined ? amount * 100 : undefined,
        })),
      }).unwrap();
      const created = res.created?.length ?? 0;
      const skipped = res.skipped?.length ?? 0;
      setResult(`Imported ${created} job${created === 1 ? "" : "s"}${skipped ? `, ${skipped} skipped` : ""}.`);
      if (created > 0 || skipped > 0) setText("");
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
        <DialogTitle>Import historical jobs</DialogTitle>
      </DialogHeader>
      <DialogContent>
        <div className="flex flex-col gap-2 text-xs text-fg-muted">
          <p>
            Backfill the paper records from before the software. One job per line,
            fields separated by{" "}
            <code className="px-1 rounded bg-surface-300 text-fg">&nbsp;|&nbsp;</code>:
          </p>
          <pre className="rounded-lg border border-border bg-surface-300 px-3 py-2 text-[11px] text-fg leading-relaxed overflow-x-auto">
            {`John Doe | Repair fridge | 2023-06-14 | 25000
Mother Smile School | AC maintenance | 2024-02-09
237679147095 | Replace compressor | 2022-12-20 | 74500`}
          </pre>
          <p className="flex items-center gap-1.5">
            Customers are matched by name/phone when they already exist — otherwise they are created for you.
            <InfoTip label="How customers are handled">
              The first field may be a customer name, phone number, or email. If no existing
              customer matches, a new customer is created automatically with that name/phone.
              The date must be YYYY-MM-DD, and the amount is in FCFA (whole numbers only).
            </InfoTip>
          </p>
        </div>

        <div className="mt-2">
          <label className="text-xs font-medium text-fg-muted">Status this import as</label>
          <FormSelect
            value={status}
            onChange={setStatus}
            options={STATUS_OPTIONS}
            className="mt-1 max-w-[200px]"
            ariaLabel="Import status"
          />
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"John Doe | Repair fridge | 2023-06-14 | 25000\nGrace Nkong | AC maintenance"}
          className="mt-2 min-h-[150px] px-3 py-2 rounded-lg border border-border bg-surface-300 text-fg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 resize-y font-mono"
          data-tour="job-import-input"
        />

        {!rows.length && text.trim() && (
          <p className="text-xs text-amber">No lines parsed yet.</p>
        )}

        {rows.length > 0 && (
          <div className="mt-1 flex flex-col gap-2">
            <p className="text-xs text-fg-muted">
              <span className="font-semibold text-fg">{valid.length}</span> ready to import{" "}
              {newCustomers > 0 && (
                <>
                  · <span className="text-fg-link">{newCustomers} new customer{newCustomers === 1 ? "" : "s"}</span> to be created
                </>
              )}
              {invalid.length > 0 && (
                <>
                  {" "}· <span className="text-amber">{invalid.length} invalid</span>
                </>
              )}
            </p>

            {valid.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                {valid.slice(0, 30).map((r, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 px-3 py-1.5 text-[11px]">
                    <span className="truncate text-fg">
                      <span className="font-medium">{r.customerName}</span>
                      <span className="text-fg-dim"> · {r.title}</span>
                      {r.date && <span className="text-fg-dim"> · {r.date}</span>}
                      {r.amount !== undefined && <span className="text-fg-dim"> · {r.amount}</span>}
                    </span>
                    {r.match ? (
                      <Badge variant="secondary" className="shrink-0 text-[10px]">existing</Badge>
                    ) : (
                      <Badge className="shrink-0 text-[10px]">new</Badge>
                    )}
                  </div>
                ))}
                {valid.length > 30 && (
                  <p className="px-3 py-1.5 text-[10px] text-fg-dim">
                    +{valid.length - 30} more
                  </p>
                )}
              </div>
            )}

            {invalid.length > 0 && (
              <div className="max-h-24 overflow-y-auto rounded-lg border border-border bg-surface-300 p-2 text-[11px] text-fg-muted">
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
          <p className="text-xs text-emerald" data-tour="job-import-result">
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
            data-tour="job-import-submit"
          >
            Import {valid.length > 0 ? `${valid.length} job${valid.length === 1 ? "" : "s"}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}