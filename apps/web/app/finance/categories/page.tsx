"use client";

import { useState } from "react";
import { useCostCentersQuery, useCreateCostCenterMutation, useCreateExpenseCategoryMutation, useDeleteCostCenterMutation, useDeleteExpenseCategoryMutation, useExpenseCategoriesQuery } from "@/lib/redux/api";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function TagList({
  title,
  subtitle,
  items,
  onAdd,
  onDelete,
  addPlaceholder,
  showCode,
}: {
  title: string;
  subtitle: string;
  items: Array<{ id: string; name: string; code?: string | null }>;
  onAdd: (name: string, code: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  addPlaceholder: string;
  showCode?: boolean;
}) {
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      <p className="text-xs text-fg-dim mb-4">{subtitle}</p>

      <div className="flex flex-wrap gap-2 mb-4">
        {items.length === 0 && <p className="text-sm text-fg-dim">Nothing yet.</p>}
        {items.map((it) => (
          <span key={it.id} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs text-fg">
            {it.name}
            {showCode && it.code && <span className="text-fg-dim font-mono">({it.code})</span>}
            <button
              type="button"
              aria-label={`Delete ${it.name}`}
              className="text-fg-muted hover:text-red"
              onClick={async () => { try { await onDelete(it.id); } catch { /* ignore */ } }}
            >✕</button>
          </span>
        ))}
      </div>

      <form
        className="flex flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          setBusy(true);
          setError(null);
          try {
            await onAdd(newName.trim(), newCode.trim());
            setNewName(""); setNewCode("");
          } catch {
            setError("Could not save — it may already exist.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={addPlaceholder} className="max-w-56" />
        {showCode && <Input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="Code (e.g. OPS)" className="max-w-32" />}
        <Button type="submit" size="sm" loading={busy}>+ Add</Button>
      </form>
      {error && <p className="text-red text-xs mt-2">{error}</p>}
    </Card>
  );
}

export default function FinanceConfigPage() {
  const { data: categories = [], isLoading: catLoading } = useExpenseCategoriesQuery();
  const { data: costCenters = [], isLoading: ccLoading } = useCostCentersQuery();
  const [createCategory] = useCreateExpenseCategoryMutation();
  const [deleteCategory] = useDeleteExpenseCategoryMutation();
  const [createCC] = useCreateCostCenterMutation();
  const [deleteCC] = useDeleteCostCenterMutation();

  if (catLoading || ccLoading) {
    return <div><Skeleton className="h-8 w-40 mb-2" /><Skeleton className="h-4 w-56 mb-6" /><div className="grid md:grid-cols-2 gap-4"><Skeleton className="h-40 rounded-xl" /><Skeleton className="h-40 rounded-xl" /></div></div>;
  }

  return (
    <div>
      <PageHeader title="Finance setup" description="Expense categories and cost centers used across expenses, bills, budgets, and reports." />
      <div className="grid md:grid-cols-2 gap-4">
        <TagList
          title="Expense categories"
          subtitle="Used on expense reports, bills, budgets, and petty cash."
          items={categories}
          onAdd={async (name) => createCategory({ name }).unwrap()}
          onDelete={async (id) => deleteCategory(id).unwrap()}
          addPlaceholder="New category name..."
        />
        <TagList
          title="Cost centers"
          subtitle="Departments for slicing spend — budgets and reports can be per cost center."
          items={costCenters}
          onAdd={async (name, code) => createCC({ name, ...(code ? { code } : {}) }).unwrap()}
          onDelete={async (id) => deleteCC(id).unwrap()}
          addPlaceholder="New cost center name..."
          showCode
        />
      </div>
    </div>
  );
}