"use client";

import { useParams } from "next/navigation";
import { PlanEditorPage } from "@/components/plan-editor-page";

export default function EditServicePlanPage() {
  const params = useParams<{ id: string }>();
  return <PlanEditorPage planId={params.id} />;
}