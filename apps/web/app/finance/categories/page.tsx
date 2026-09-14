"use client";

import { useState } from "react";
import {
  useCostCentersQuery,
  useCreateCostCenterMutation,
  usePatchCostCenterMutation,
  useDeleteCostCenterMutation,
  useCreateExpenseCategoryMutation,
  usePatchExpenseCategoryMutation,
  useDeleteExpenseCategoryMutation,
  useExpenseCategoriesQuery,
  useSeedFinanceSetupMutation,
} from "@/lib/redux/api";
import { EXPENSE_DEFAULT_CATEGORIES, DEFAULT_COST_CENTERS } from "@nnact/shared";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchIcon } from "lucide-react";

/* ─── Expense Categories Table ─────────────────────────────────────── */

function ExpenseCategoriesTable() {
  const { data: categories = [], isLoading } = useExpenseCategoriesQuery();
  const [createCategory] = useCreateExpenseCategoryMutation();
  const [patchCategory] = usePatchExpenseCategoryMutation();
  const [deleteCategory] = useDeleteExpenseCategoryMutation();
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  const filtered = categories.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  );

  if (isLoading) {
    return <Skeleton className="h-64 rounded-xl" />;
  }

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-fg">Expense categories</h3>
      <p className="text-xs text-fg-dim mb-3">
        What did we spend money on? Used on expenses, bills, budgets, and petty
        cash.
      </p>

      <div className="relative mb-3">
        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-fg-muted" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search categories..."
          className="pl-8 text-xs"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-fg-dim mb-3">
          {categories.length === 0 ? "Nothing yet." : "No matches."}
        </p>
      ) : (
        <div className="max-h-96 overflow-y-auto mb-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell className="font-medium">{cat.name}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => {
                          setEditId(cat.id);
                          setEditName(cat.name);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-red hover:text-red"
                        onClick={async () => {
                          try {
                            await deleteCategory(cat.id).unwrap();
                          } catch {
                            /* ignore */
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          setBusy(true);
          setError(null);
          try {
            await createCategory({ name: newName.trim() }).unwrap();
            setNewName("");
          } catch {
            setError("Could not save — it may already exist.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category name..."
          className="flex-1 text-xs"
        />
        <Button type="submit" size="sm" loading={busy}>
          + Add
        </Button>
      </form>
      {error && <p className="text-red text-xs mt-2">{error}</p>}

      <Dialog open={!!editId} onOpenChange={(open) => !open && setEditId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename category</DialogTitle>
            <DialogDescription>
              Update the category name. This affects future entries only.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Category name"
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditId(null)}>
              Cancel
            </Button>
            <Button
              loading={editBusy}
              onClick={async () => {
                if (!editId || !editName.trim()) return;
                setEditBusy(true);
                try {
                  await patchCategory({
                    id: editId,
                    data: { name: editName.trim() },
                  }).unwrap();
                  setEditId(null);
                } catch {
                  setError("Could not rename — it may already exist.");
                } finally {
                  setEditBusy(false);
                }
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ─── Cost Centers Table ───────────────────────────────────────────── */

function CostCentersTable() {
  const { data: costCenters = [], isLoading } = useCostCentersQuery();
  const [createCC] = useCreateCostCenterMutation();
  const [patchCC] = usePatchCostCenterMutation();
  const [deleteCC] = useDeleteCostCenterMutation();
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  const filtered = costCenters.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.code && c.code.toLowerCase().includes(search.toLowerCase())),
  );

  if (isLoading) {
    return <Skeleton className="h-64 rounded-xl" />;
  }

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-fg">Cost centers</h3>
      <p className="text-xs text-fg-dim mb-3">
        Which part of NNACT spent the money? Departments for slicing spend —
        budgets and reports can be per cost center.
      </p>

      <div className="relative mb-3">
        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-fg-muted" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search cost centers..."
          className="pl-8 text-xs"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-fg-dim mb-3">
          {costCenters.length === 0 ? "Nothing yet." : "No matches."}
        </p>
      ) : (
        <div className="max-h-96 overflow-y-auto mb-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((cc) => (
                <TableRow key={cc.id}>
                  <TableCell>
                    {cc.code && (
                      <Badge variant="outline" className="font-mono text-xs">
                        {cc.code}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    <div>
                      <span>{cc.name}</span>
                      {cc.description && (
                        <p className="text-xs text-fg-dim mt-0.5 truncate max-w-xs">
                          {cc.description}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => {
                          setEditId(cc.id);
                          setEditName(cc.name);
                          setEditCode(cc.code ?? "");
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-red hover:text-red"
                        onClick={async () => {
                          try {
                            await deleteCC(cc.id).unwrap();
                          } catch {
                            /* ignore */
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          setBusy(true);
          setError(null);
          try {
            await createCC({
              name: newName.trim(),
              ...(newCode.trim() ? { code: newCode.trim() } : {}),
            }).unwrap();
            setNewName("");
            setNewCode("");
          } catch {
            setError("Could not save — it may already exist.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New cost center name..."
          className="flex-1 text-xs"
        />
        <Input
          value={newCode}
          onChange={(e) => setNewCode(e.target.value)}
          placeholder="Code (e.g. OPS)"
          className="w-28 text-xs"
        />
        <Button type="submit" size="sm" loading={busy}>
          + Add
        </Button>
      </form>
      {error && <p className="text-red text-xs mt-2">{error}</p>}

      <Dialog open={!!editId} onOpenChange={(open) => !open && setEditId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit cost center</DialogTitle>
            <DialogDescription>
              Update the cost center name and code.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-fg">Name</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Cost center name"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-medium text-fg">Code</label>
              <Input
                value={editCode}
                onChange={(e) => setEditCode(e.target.value)}
                placeholder="e.g. OPS"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditId(null)}>
              Cancel
            </Button>
            <Button
              loading={editBusy}
              onClick={async () => {
                if (!editId || !editName.trim()) return;
                setEditBusy(true);
                try {
                    await patchCC({
                    id: editId,
                    data: {
                      name: editName.trim(),
                      code: editCode.trim() || undefined,
                    },
                  }).unwrap();
                  setEditId(null);
                } catch {
                  setError("Could not save — it may already exist.");
                } finally {
                  setEditBusy(false);
                }
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ─── Main Page ────────────────────────────────────────────────────── */

export default function FinanceConfigPage() {
  const { data: categories = [], isLoading: catLoading } =
    useExpenseCategoriesQuery();
  const { data: costCenters = [], isLoading: ccLoading } =
    useCostCentersQuery();
  const [seedFinanceSetup, { isLoading: seeding }] =
    useSeedFinanceSetupMutation();
  const [seedResult, setSeedResult] = useState<string | null>(null);

  if (catLoading || ccLoading) {
    return (
      <div>
        <Skeleton className="h-8 w-40 mb-2" />
        <Skeleton className="h-4 w-56 mb-6" />
        <div className="grid md:grid-cols-2 gap-4">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  const isEmpty = categories.length === 0 && costCenters.length === 0;

  async function handleSeed() {
    try {
      const result = await seedFinanceSetup({
        categories: [...EXPENSE_DEFAULT_CATEGORIES],
        costCenters: [...DEFAULT_COST_CENTERS],
      }).unwrap();
      const parts: string[] = [];
      if (result.createdCategories > 0)
        parts.push(`${result.createdCategories} expense categories`);
      if (result.createdCostCenters > 0)
        parts.push(`${result.createdCostCenters} cost centers`);
      if (result.skippedCategories > 0)
        parts.push(`${result.skippedCategories} categories already existed`);
      if (result.skippedCostCenters > 0)
        parts.push(`${result.skippedCostCenters} cost centers already existed`);
      setSeedResult(
        parts.length > 0
          ? `Setup complete: ${parts.join(", ")}.`
          : "All recommended items already exist.",
      );
    } catch {
      setSeedResult("Failed to load recommended setup.");
    }
  }

  return (
    <div>
      <PageHeader
        title="Finance setup"
        description="Expense categories and cost centers used across expenses, bills, budgets, and reports."
      />

      {isEmpty && (
        <Card className="p-6 mb-6 text-center">
          <h3 className="text-sm font-semibold text-fg mb-1">
            No finance setup yet
          </h3>
          <p className="text-xs text-fg-dim mb-4 max-w-md mx-auto">
            Load NNACT&apos;s recommended expense categories and cost centers
            to get started. You can customise them afterwards.
          </p>
          <Button onClick={handleSeed} loading={seeding}>
            Load Recommended Setup
          </Button>
          {seedResult && (
            <p className="text-xs text-fg-dim mt-3">{seedResult}</p>
          )}
        </Card>
      )}

      {seedResult && !isEmpty && (
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xs text-fg-dim">{seedResult}</p>
          <Button variant="ghost" size="sm" onClick={() => setSeedResult(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {!isEmpty && (
        <div className="mb-4 flex justify-end">
          <Button variant="outline" size="sm" onClick={handleSeed} loading={seeding}>
            Load Recommended Setup
          </Button>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <ExpenseCategoriesTable />
        <CostCentersTable />
      </div>
    </div>
  );
}
