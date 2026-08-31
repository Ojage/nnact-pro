"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreateModelButton } from "@/components/repair-brain/create-model-dialog";
import { ImportKnowledgeButton } from "@/components/repair-brain/import-knowledge-dialog";
import { useRepairBrainModelsQuery } from "@/lib/redux/api";

export default function EquipmentModelsListPage() {
  const { data: models = [], isLoading: loading } = useRepairBrainModelsQuery();

  return (
    <div>
      <PageHeader
        title="Equipment Models"
        description="Reusable technical knowledge catalogued by product identity."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/repair-brain">
              <Button variant="secondary" size="sm">
                ← Repair Brain
              </Button>
            </Link>
            <ImportKnowledgeButton />
            <CreateModelButton />
          </div>
        }
      />

      {loading && <p className="text-fg-muted">Loading models…</p>}

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3" data-tour="rb-models">
        {models.map((m) => (
          <Link key={m.id} href={`/repair-brain/models/${m.id}`}>
            <Card className="hover:bg-surface-300 transition-colors h-full">
              <CardContent className="pt-4">
                <div className="font-medium">
                  {m.manufacturer} {m.modelNumber}
                </div>
                {m.modelName && <div className="text-sm text-fg-muted">{m.modelName}</div>}
                <div className="text-xs text-fg-muted mt-2 capitalize">{m.category.replaceAll("_", " ")}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {!loading && models.length === 0 && (
        <p className="text-fg-muted text-sm">No equipment models yet. Create one from a field repair or manually.</p>
      )}
    </div>
  );
}
