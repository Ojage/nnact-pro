"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, ExternalLink, FileUp, Plus, RefreshCw, UserPlus, Users, Activity, Sparkles } from "lucide-react";
import { PrefetchLink as Link } from "@/components/prefetch-link";
import { usePrefetchListDetails } from "@/hooks/use-prefetch-list-details";
import { useActivitiesQuery, useCreateCustomerMutation, useCustomersQuery } from "@/lib/redux/api";
import { formatRelativeTime } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { InfoTip } from "@/components/ui/info-tip";
import {
  Banner,
  ConsoleHeader,
  ConsolePage,
  ResourceTable,
  SummaryCards,
  ToolbarButton,
  downloadCsv,
  outlineButton,
  primaryButton,
  resourceLink,
  type Column,
} from "@/components/console";
import CustomerImportDialog from "./import-dialog";
import type { ActivityDTO, CustomerDTO } from "@nnact/shared";
import { ADVANCE_TAG } from "@nnact/shared";
import { emitWalkthroughDone } from "@/lib/walkthroughs/events";

const DAY = 86_400_000;

export default function CustomersPage() {
  const router = useRouter();
  const customersQuery = useCustomersQuery();
  const { data: customers = [], isLoading, isError } = customersQuery;
  const { data: activities = [] } = useActivitiesQuery();
  const [createCustomer, { isLoading: creating }] = useCreateCustomerMutation();

  // ── Create-customer dialog ──
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createNotes, setCreateNotes] = useState("");
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [visible, setVisible] = useState<CustomerDTO[]>([]);

  // ── Last activity per customer ──
  const lastActivityMap = useMemo(() => {
    const map = new Map<string, ActivityDTO>();
    for (const a of activities) {
      if (!a.customerId) continue;
      const existing = map.get(a.customerId);
      if (!existing || new Date(a.createdAt) > new Date(existing.createdAt)) {
        map.set(a.customerId, a);
      }
    }
    return map;
  }, [activities]);

  usePrefetchListDetails(
    "customers",
    useMemo(() => visible.slice(0, 40).map((c) => c.id), [visible]),
  );
  const onFilteredChange = useCallback((rows: CustomerDTO[]) => setVisible(rows), []);

  // ── Create customer handler ──
  const handleCreateCustomer = async () => {
    if (!createName.trim()) return;
    setCreateErr(null);
    try {
      await createCustomer({
        name: createName.trim(),
        email: createEmail.trim() || undefined,
        phone: createPhone.trim() || undefined,
        notes: createNotes.trim() || undefined,
      }).unwrap();
      emitWalkthroughDone(ADVANCE_TAG.customerCreated);
      setShowCreate(false);
      setCreateName("");
      setCreateEmail("");
      setCreatePhone("");
      setCreateNotes("");
    } catch {
      setCreateErr("Failed to create customer");
    }
  };

  const exportCustomers = (rows: readonly CustomerDTO[]) =>
    downloadCsv(`customers-${new Date().toISOString().slice(0, 10)}.csv`, rows, [
      ["Name", (c) => c.name],
      ["Email", (c) => c.email ?? ""],
      ["Phone", (c) => c.phone ?? ""],
      ["Address", (c) => c.primaryAddress ?? ""],
      ["Added", (c) => c.createdAt],
    ]);

  const columns: Column<CustomerDTO>[] = [
    {
      id: "name",
      header: "Name",
      sortValue: (c) => c.name,
      cell: (c) => (
        <span className="grid">
          <Link href={`/customers/${c.id}`} data-tour="customers-link" className={resourceLink}>
            {c.name}
          </Link>
          {c.primaryAddress ? <span className="max-w-[18rem] truncate text-xs text-fg-muted">{c.primaryAddress}</span> : null}
        </span>
      ),
    },
    {
      id: "contact",
      header: "Contact",
      sortValue: (c) => c.email ?? c.phone ?? "",
      cell: (c) =>
        c.email || c.phone ? (
          <span className="grid text-sm">
            {c.email ? (
              <a href={`mailto:${c.email}`} className="text-fg hover:text-[var(--shell-accent-text)] hover:underline">
                {c.email}
              </a>
            ) : null}
            {c.phone ? (
              <a href={`tel:${c.phone}`} className="text-fg-muted hover:text-[var(--shell-accent-text)] hover:underline">
                {c.phone}
              </a>
            ) : null}
          </span>
        ) : (
          <span className="text-fg-muted">No contact details</span>
        ),
    },
    {
      id: "lastActivity",
      header: "Last activity",
      hideBelow: "md",
      sortValue: (c) => {
        const last = lastActivityMap.get(c.id);
        return last ? new Date(last.createdAt).getTime() : null;
      },
      cell: (c) => {
        const last = lastActivityMap.get(c.id);
        return last ? (
          <span className="grid max-w-[22rem]">
            <span className="truncate text-fg">{last.summary}</span>
            <span className="text-xs text-fg-muted">{formatRelativeTime(last.createdAt)}</span>
          </span>
        ) : (
          <span className="text-fg-muted">No activity</span>
        );
      },
    },
    {
      id: "createdAt",
      header: "Added",
      hideBelow: "sm",
      sortValue: (c) => new Date(c.createdAt).getTime(),
      cell: (c) => <span className="whitespace-nowrap text-fg-muted">{new Date(c.createdAt).toLocaleDateString()}</span>,
    },
  ];

  // ── Loading ──
  if (isLoading) {
    return (
      <div className="grid gap-4" aria-busy="true" aria-label="Loading customers">
        <Skeleton className="h-8 w-48 rounded-[6px]" />
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-[8px]" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-[8px]" />
      </div>
    );
  }

  const newThisMonth = customers.filter((c) => new Date(c.createdAt).getTime() > Date.now() - 30 * DAY).length;
  const activeShare = customers.length ? lastActivityMap.size / customers.length : 0;

  return (
    <ConsolePage>
      <ConsoleHeader
        title="Customers"
        toolbar={
          <>
            <ToolbarButton icon={UserPlus} data-tour="customers-add" onClick={() => setShowCreate(true)}>
              New Customer
            </ToolbarButton>
            <ToolbarButton icon={FileUp} data-tour="customers-import" onClick={() => setShowImport(true)}>
              Import
            </ToolbarButton>
            <ToolbarButton icon={Download} onClick={() => exportCustomers(visible.length ? visible : customers)} disabled={customers.length === 0}>
              Export CSV
            </ToolbarButton>
            <ToolbarButton
              icon={RefreshCw}
              spinning={customersQuery.isFetching}
              disabled={customersQuery.isFetching}
              onClick={() => void customersQuery.refetch()}
            >
              Refresh
            </ToolbarButton>
          </>
        }
      />

      {isError ? (
        <Banner tone="danger" title="Customers could not be loaded.">
          Check your connection and try again.
        </Banner>
      ) : null}

      {customers.length > 0 ? (
        <SummaryCards
          label="Customer summary"
          items={[
            { label: "Customers", icon: Users, value: customers.length, note: "In this branch scope" },
            {
              label: "With activity",
              icon: Activity,
              value: lastActivityMap.size,
              meter: activeShare,
              note: `${Math.round(activeShare * 100)}% have jobs, invoices or messages`,
            },
            { label: "New in the last 30 days", icon: Sparkles, value: newThisMonth, note: newThisMonth ? "Added recently" : "No new customers" },
          ]}
        />
      ) : null}

      <div data-tour="customers-list" className="min-w-0">
        <ResourceTable
          caption="Customers"
          rows={customers}
          columns={columns}
          getRowId={(c) => c.id}
          rowLabel={(c) => c.name}
          searchText={(c) => [c.name, c.email, c.phone, c.primaryAddress].filter(Boolean).join(" ")}
          filterPlaceholder="Search customers by name, email, phone or address"
          defaultSort={{ id: "name", dir: "asc" }}
          minWidth="40rem"
          selectable
          onFilteredChange={onFilteredChange}
          bulkActions={(selected) => (
            <ToolbarButton icon={Download} onClick={() => exportCustomers(selected)}>
              Export selected
            </ToolbarButton>
          )}
          rowMenu={(c) => [
            { label: "View details", icon: ExternalLink, onSelect: () => router.push(`/customers/${c.id}`) },
            { label: "Copy email", icon: Copy, disabled: !c.email, onSelect: () => void navigator.clipboard?.writeText(c.email ?? "") },
          ]}
          empty={
            <div className="grid justify-items-center gap-2 px-6 py-12 text-center">
              <p className="text-base font-medium text-fg">No customers yet</p>
              <p className="max-w-md text-sm text-fg-muted">Add your first customer, or import a list from a spreadsheet.</p>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <button type="button" className={primaryButton} data-tour="customers-add" onClick={() => setShowCreate(true)}>
                  <Plus className="size-4" aria-hidden="true" />
                  New Customer
                </button>
                <button type="button" className={outlineButton} onClick={() => setShowImport(true)}>
                  <FileUp className="size-4" aria-hidden="true" />
                  Import
                </button>
              </div>
            </div>
          }
        />
      </div>

      {/* ── Create customer dialog ── */}
      <Dialog
        open={showCreate}
        data-tour="customer-create-dialog"
        onOpenChange={(open) => {
          if (!open) {
            setCreateName("");
            setCreateEmail("");
            setCreatePhone("");
            setCreateNotes("");
            setCreateErr(null);
          }
          setShowCreate(open);
        }}
      >
        <DialogHeader>
          <DialogTitle>New Customer</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateCustomer();
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="customer-create-name" className="text-sm font-medium text-fg">Name *</label>
              <input
                id="customer-create-name"
                data-tour="customer-create-name"
                className="h-10 rounded-[6px] border border-[var(--shell-border)] bg-[var(--shell-panel)] px-3 text-sm text-fg focus:border-[var(--shell-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--shell-focus)]"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Jane Smith"
                autoFocus
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="customer-create-email" className="text-sm font-medium text-fg">Email</label>
              <input
                className="h-10 rounded-[6px] border border-[var(--shell-border)] bg-[var(--shell-panel)] px-3 text-sm text-fg focus:border-[var(--shell-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--shell-focus)]"
                id="customer-create-email"
                type="email"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                placeholder="jane@example.com"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="customer-create-phone" className="text-sm font-medium text-fg">Phone</label>
              <input
                className="h-10 rounded-[6px] border border-[var(--shell-border)] bg-[var(--shell-panel)] px-3 text-sm text-fg focus:border-[var(--shell-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--shell-focus)]"
                id="customer-create-phone"
                type="tel"
                value={createPhone}
                onChange={(e) => setCreatePhone(e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="customer-create-notes" className="inline-flex items-center gap-1.5 text-sm font-medium text-fg">
                Notes
                <InfoTip label="About customer notes">Visible only to your team — customers never see these notes.</InfoTip>
              </label>
              <textarea
                id="customer-create-notes"
                className="min-h-[80px] resize-none rounded-[6px] border border-[var(--shell-border)] bg-[var(--shell-panel)] px-3 py-2 text-sm text-fg focus:border-[var(--shell-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--shell-focus)]"
                value={createNotes}
                onChange={(e) => setCreateNotes(e.target.value)}
                placeholder="Optional notes..."
              />
            </div>
            {createErr && (
              <p role="alert" className="text-sm text-[var(--console-danger-fg)]">{createErr}</p>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" size="sm" disabled={creating} onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" data-tour="customer-create-submit" loading={creating} disabled={!createName.trim()}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <CustomerImportDialog open={showImport} onOpenChange={setShowImport} />
    </ConsolePage>
  );
}
