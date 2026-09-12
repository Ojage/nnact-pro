"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type {
  ServicePlanDTO,
  ServiceCategoryDTO,
  ServiceChecklistDTO,
} from "@nnact/shared";
import { PlanEditor } from "@/components/service-plan-editor";

export function PlanEditorPage({ planId }: { planId?: string }) {
  const router = useRouter();
  const [plan, setPlan] = useState<ServicePlanDTO | null | undefined>(planId ? undefined : null);
  const [categories, setCategories] = useState<ServiceCategoryDTO[]>([]);
  const [checklists, setChecklists] = useState<ServiceChecklistDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [categoryRows, checklistRows, planRow] = await Promise.all([
          api.serviceCategories(),
          api.serviceChecklists(),
          planId ? api.getServicePlan(planId) : Promise.resolve(null),
        ]);
        setCategories(categoryRows);
        setChecklists(checklistRows);
        setPlan(planRow ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load plan");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [planId]);

  if (loading) {
    return (
      <Card>
        <p className="text-sm text-fg-muted">Loading plan editor…</p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-red/30 bg-red/5">
        <p className="text-sm font-medium text-red">Unable to load plan editor</p>
        <p className="mt-1 text-xs text-fg-muted">{error}</p>
      </Card>
    );
  }

  return (
    <div>
      <PageHeader
        title={plan ? "Edit service plan" : "New service plan"}
        description={
          plan
            ? `Plan template ${plan.name} — configuration. Live agreements keep the snapshot they were created from.`
            : "Define the template first; subscribe customers under it afterwards as agreements."
        }
      />
      <PlanEditor
        plan={plan}
        categories={categories}
        checklists={checklists}
        onCancel={() => router.push("/service-plans")}
        onSaved={(saved) => router.push(`/service-plans/${saved.id}`)}
      />
    </div>
  );
}