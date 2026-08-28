"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, PackageSearch, Pencil, Plus, Search, Trash2, TriangleAlert } from "lucide-react";
import {
  CURRENCY_CATALOG,
  DEFAULT_CURRENCY,
  formatMoney,
  isCurrencyCode,
  type CurrencyCode,
} from "@nnact/shared";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/form-select";
import { InfoTip } from "@/components/ui/info-tip";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface CatalogItem {
  id: string;
  categoryId: string;
  name: string;
  description?: string | null;
  priceCents: number;
  active: boolean;
}

interface CatalogCategory {
  id: string;
  name: string;
  description?: string | null;
}

const NEW_CATEGORY = "__new__";

export default function PriceBookPage() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  const [currency, setCurrency] = useState<CurrencyCode>(DEFAULT_CURRENCY);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    price: 0,
    categoryId: "",
    newCategory: "",
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<CatalogItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [itemRows, categoryRows, org] = await Promise.all([
        api.catalogItems(),
        api.catalogCategories(),
        api.org(),
      ]);
      setItems(itemRows);
      setCategories(categoryRows);
      if (isCurrencyCode(org.businessSettings?.currency)) {
        setCurrency(org.businessSettings.currency);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load the price book");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000);
  }, []);

  const categoryNames = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  const currencySymbol = CURRENCY_CATALOG[currency].symbol;

  const filtered = useMemo(() => {
    let list = [...items];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.description ?? "").toLowerCase().includes(q),
      );
    }
    if (categoryFilter !== "all") {
      list = list.filter((s) => s.categoryId === categoryFilter);
    }
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [items, search, categoryFilter]);

  const openNew = () => {
    setEditing(null);
    setForm({
      name: "",
      description: "",
      price: 0,
      categoryId: categories.length ? categories[0].id : NEW_CATEGORY,
      newCategory: "",
    });
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (item: CatalogItem) => {
    setEditing(item);
    setForm({
      name: item.name,
      description: item.description ?? "",
      price: item.priceCents / 100,
      categoryId: item.categoryId,
      newCategory: "",
    });
    setFormError(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    setFormError(null);
  };

  const handleSave = async () => {
    const priceCents = Math.round(form.price * 100);
    if (!form.name.trim()) {
      setFormError("Give the service a name.");
      return;
    }
    if (priceCents <= 0) {
      setFormError("Enter a price greater than 0.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      let categoryId = form.categoryId;
      if (categoryId === NEW_CATEGORY) {
        const name = form.newCategory.trim();
        if (!name) {
          setFormError("Name the new category before saving.");
          return;
        }
        const created = await api.createCatalogCategory({ name });
        categoryId = created.id;
        setCategories((prev) =>
          prev.some((c) => c.id === created.id) ? prev : [...prev, created],
        );
      }

      if (editing) {
        await api.patchCatalogItem(editing.id, {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          priceCents,
          categoryId,
        });
        showNotice("Service updated.");
      } else {
        await api.createCatalogItem({
          categoryId,
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          priceCents,
          costCents: 0,
          taxable: true,
          active: true,
        });
        showNotice("Service added to the price book.");
      }
      closeForm();
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? `Save failed: ${e.message}` : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.deleteCatalogItem(pendingDelete.id);
      setItems((prev) => prev.filter((s) => s.id !== pendingDelete.id));
      showNotice(`Deleted "${pendingDelete.name}".`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader
          title="Price Book"
          description="Your org's service catalog and rates."
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Price Book"
        description={`${items.length} service${items.length === 1 ? "" : "s"} · ${categories.length} categor${categories.length === 1 ? "y" : "ies"}`}
        actions={
          <Button onClick={openNew} size="sm">
            <Plus aria-hidden /> Add service
          </Button>
        }
      />

      {error && (
        <Card className="mb-5 border-red/30 bg-red/5">
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <span className="flex items-center gap-2 text-sm text-red">
              <TriangleAlert className="size-4 shrink-0" aria-hidden />
              {error}
            </span>
            <Button size="sm" variant="secondary" onClick={() => void load()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {notice && (
        <div
          role="status"
          className="mb-5 flex items-center gap-2 rounded-lg border border-chart-2/30 bg-chart-2/10 px-4 py-3 text-sm text-chart-2"
        >
          <Check className="size-4 shrink-0" aria-hidden />
          {notice}
        </div>
      )}

      {items.length > 0 && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1 sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-dim"
              aria-hidden
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search services…"
              className="pl-9"
              aria-label="Search services"
            />
          </div>
          {categories.length > 0 && (
            <FormSelect
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={[
                { value: "all", label: "All categories" },
                ...categories.map((c) => ({ value: c.id, label: c.name })),
              ]}
              className="sm:w-52"
            />
          )}
        </div>
      )}

      {formOpen && (
        <Card className="mb-4 border-accent/30">
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-fg">
                  {editing ? "Edit service" : "Add a service"}
                </h3>
                <p className="mt-0.5 text-sm text-fg-muted">
                  {editing
                    ? "Update the rate and details for this service."
                    : "Rates are stored for your whole org and reused when you bill jobs."}
                </p>
              </div>
              <span className="rounded-full bg-surface-300 px-2.5 py-1 text-xs font-semibold text-fg-muted">
                {editing ? "Editing" : "New"}
              </span>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="svc-name" className="block text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  Service name <span className="text-red">*</span>
                </Label>
                <Input
                  id="svc-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Split AC diagnostic + top-up"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="svc-price" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  Price <span className="text-red">*</span>
                  <InfoTip label="About price">
                    The rate billed to the customer for this service. Stored in cents behind the scenes.
                  </InfoTip>
                </Label>
                <div className="relative">
                  <span
                    className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm ${currencySymbol.length > 1 ? "text-fg-muted" : "text-fg-dim"}`}
                    aria-hidden
                  >
                    {currencySymbol}
                  </span>
                  <MoneyInput
                    id="svc-price"
                    value={form.price}
                    onValueChange={(value) => setForm((f) => ({ ...f, price: value }))}
                    placeholder="0"
                    inputMode="decimal"
                    aria-label={`Price in ${currency}`}
                    className={currencySymbol.length > 1 ? "pl-16" : "pl-7"}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="svc-category" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  Category
                  <InfoTip label="Category">
                    Group services by trade so they're easy to filter and report on.
                  </InfoTip>
                </Label>
                <FormSelect
                  id="svc-category"
                  value={form.categoryId}
                  onChange={(categoryId) => setForm((f) => ({ ...f, categoryId }))}
                  options={[
                    { value: NEW_CATEGORY, label: "+ New category…" },
                    ...categories.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
              </div>

              {form.categoryId === NEW_CATEGORY && (
                <div className="space-y-2">
                  <Label htmlFor="svc-newcat" className="block text-xs font-semibold uppercase tracking-wide text-fg-muted">
                    New category name <span className="text-red">*</span>
                  </Label>
                  <Input
                    id="svc-newcat"
                    value={form.newCategory}
                    onChange={(e) => setForm((f) => ({ ...f, newCategory: e.target.value }))}
                    placeholder="e.g. Electrical"
                  />
                </div>
              )}

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="svc-desc" className="block text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  Description
                </Label>
                <Input
                  id="svc-desc"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Short description shown to your team (optional)"
                />
              </div>
            </div>

            {formError && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2 rounded-lg border border-red/30 bg-red/5 p-3 text-sm text-red"
              >
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {formError}
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button onClick={() => void handleSave()} loading={saving}>
                {editing ? "Save changes" : "Add service"}
              </Button>
              <Button variant="secondary" onClick={closeForm}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {items.length === 0 ? (
        <Card>
          <EmptyState
            title="No services yet"
            description="Add your first service to build your price book — it's shared with your whole org."
            actions={
              <Button size="sm" onClick={openNew}>
                <Plus aria-hidden /> Add service
              </Button>
            }
          />
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No services match your filters"
          description="Try a different search or category."
          actions={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setSearch("");
                setCategoryFilter("all");
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex h-full flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-semibold text-fg">
                      <PackageSearch className="size-4 shrink-0 text-fg-dim" aria-hidden />
                      <span className="truncate">{s.name}</span>
                    </p>
                    {s.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-fg-muted">
                        {s.description}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-fg">
                    {formatMoney(s.priceCents, currency)}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <Badge variant="secondary">
                      {categoryNames.get(s.categoryId) ?? "Uncategorized"}
                    </Badge>
                    {!s.active && <Badge variant="draft">Inactive</Badge>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => openEdit(s)}
                    >
                      <Pencil aria-hidden /> Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-red hover:bg-red/10"
                      onClick={() => setPendingDelete(s)}
                    >
                      <Trash2 aria-hidden /> Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && !deleting && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{pendingDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the service from your price book for the whole org.
              Existing invoices are not changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deleting ? "Deleting…" : "Delete service"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}