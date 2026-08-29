"use client";

import { useState } from "react";
import { ADVANCE_TAG } from "@nnact/shared";
import { emitWalkthroughDone } from "@/lib/walkthroughs/events";
import { useCreateEquipmentMutation, useDeleteEquipmentMutation, useEquipmentQuery, type EquipmentDTO } from "@/lib/redux/api";
import { Card, CardAction, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/form-select";
import { InfoTip } from "@/components/ui/info-tip";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

interface EquipmentForm {
  type: string;
  make: string;
  model: string;
  serialNumber: string;
  installDate: string;
  warrantyExpiry: string;
  notes: string;
}

const EQUIPMENT_TYPES = ["furnace", "ac_unit", "water_heater", "heat_pump", "boiler", "other"];

const TYPE_LABELS: Record<string, string> = {
  furnace: "Furnace",
  ac_unit: "AC Unit",
  water_heater: "Water Heater",
  heat_pump: "Heat Pump",
  boiler: "Boiler",
  other: "Other",
};

const initForm: EquipmentForm = {
  type: "furnace",
  make: "",
  model: "",
  serialNumber: "",
  installDate: "",
  warrantyExpiry: "",
  notes: "",
};

export function CustomerEquipment({ customerId }: { customerId: string }) {
  const { data: equipment = [], isLoading: loading } = useEquipmentQuery({ customerId }, { skip: !customerId });
  const [createEquipment, { isLoading: submitting }] = useCreateEquipmentMutation();
  const [deleteEquipment, { isLoading: deleting }] = useDeleteEquipmentMutation();
  const [addOpen, setAddOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState<EquipmentForm>(initForm);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    setError(null);
    try {
      await createEquipment({
        customerId,
        type: form.type,
        make: form.make || undefined,
        model: form.model || undefined,
        serialNumber: form.serialNumber || undefined,
        installDate: form.installDate || undefined,
        warrantyExpiry: form.warrantyExpiry || undefined,
        notes: form.notes || undefined,
      }).unwrap();
      emitWalkthroughDone(ADVANCE_TAG.equipmentCreated);
      setAddOpen(false);
      setForm(initForm);
    } catch {
      setError("Failed to add equipment");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteEquipment(id).unwrap();
    } catch { /* silent */ }
    setDeletingId(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="inline-flex items-center gap-1.5">
          Equipment
          <InfoTip label="About customer equipment" side="right">
            Units installed at this customer&apos;s properties — serial numbers and warranty dates flow into work orders and service history.
          </InfoTip>
        </CardTitle>
        <CardDescription>
          {loading
            ? "Loading equipment…"
            : equipment.length === 0
              ? "No equipment tracked yet."
              : `${equipment.length} unit${equipment.length === 1 ? "" : "s"} on file.`}
        </CardDescription>
        <CardAction>
          <Button size="sm" data-tour="equipment-add" onClick={() => setAddOpen(true)}>Add equipment</Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div data-tour="equipment-section">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-red py-4">{error}</p>
        ) : equipment.length === 0 ? (
          <p className="text-sm text-fg-muted py-6 text-center">
            No equipment tracked for this customer.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {equipment.map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-lg bg-surface-200 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted bg-surface-300 px-1.5 py-0.5 rounded">
                      {TYPE_LABELS[e.type] ?? e.type}
                    </span>
                    {(e.make || e.model) && (
                      <span className="text-sm text-fg truncate">
                        {[e.make, e.model].filter(Boolean).join(" ")}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    {e.serialNumber && (
                      <span className="text-xs text-fg-dim font-mono">SN: {e.serialNumber}</span>
                    )}
                    {e.installDate && (
                      <span className="text-xs text-fg-dim">
                        Installed: {new Date(e.installDate).toLocaleDateString()}
                      </span>
                    )}
                    {e.warrantyExpiry && (
                      <span className="text-xs text-fg-dim">
                        Warranty: {new Date(e.warrantyExpiry).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                {deletingId === e.id ? (
                  <div className="flex gap-1 shrink-0">
                    <Button type="button" size="sm" variant="danger" className="h-auto px-0 text-xs" loading={deleting} onClick={() => handleDelete(e.id)}>Confirm</Button>
                    <Button type="button" size="sm" variant="ghost" className="h-auto px-0 text-xs" onClick={() => setDeletingId(null)}>Cancel</Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-auto shrink-0 px-0 text-xs text-fg-muted hover:text-destructive"
                    onClick={() => setDeletingId(e.id)}
                  >
                    Delete
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
        </div>
      </CardContent>

      {/* Add Equipment Dialog */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { if (!submitting) { setAddOpen(false); setForm(initForm); } }}>
          <div data-tour="equipment-form" className="bg-surface-200 rounded-xl border border-border w-full max-w-lg mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-fg mb-4">Add Equipment</h3>
            <div className="space-y-4">
              <div>
                <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Type *</Label>
                <FormSelect
                  value={form.type}
                  onChange={(value) => setForm((f) => ({ ...f, type: value }))}
                  options={EQUIPMENT_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] ?? t }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-fg-muted mb-1.5">Make</label>
                  <Input placeholder="Carrier" value={form.make} onChange={(e) => setForm((f) => ({ ...f, make: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-fg-muted mb-1.5">Model</label>
                  <Input placeholder="GSX14" value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-fg-muted mb-1.5">
                  Serial Number
                  <InfoTip label="About serial number">Stored on the work order so service history stays tied to the exact unit when filing warranty claims.</InfoTip>
                </label>
                <Input placeholder="SN-12345" value={form.serialNumber} onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-fg-muted mb-1.5">Install Date</label>
                  <Input type="date" value={form.installDate} onChange={(e) => setForm((f) => ({ ...f, installDate: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-fg-muted mb-1.5">
                    Warranty Expiry
                    <InfoTip label="About warranty expiry">Used to tell customers whether a repair is still under warranty before you quote it.</InfoTip>
                  </label>
                  <Input type="date" value={form.warrantyExpiry} onChange={(e) => setForm((f) => ({ ...f, warrantyExpiry: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-fg-muted mb-1.5">Notes</label>
                <textarea
                  placeholder="Warranty info, maintenance notes..."
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full rounded-lg border border-border bg-surface-300 px-3 py-2 text-sm text-fg placeholder:text-fg-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 resize-none"
                />
              </div>
              {error && <p className="text-xs text-red">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => { setAddOpen(false); setForm(initForm); }} disabled={submitting}>Cancel</Button>
                <Button onClick={handleAdd} data-tour="equipment-form" loading={submitting}>
                  Save
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ponytail: Equipment types are hardcoded. Ceiling: types are not configurable per org.
// Upgrade: add equipment_types table with org-scoped config.
