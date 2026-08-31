"use client";

import { useState } from "react";
import { ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useRateKnownFaultMutation,
  useRateModelPartMutation,
  useRateRepairProcedureMutation,
} from "@/lib/redux/api";

type Kind = "fault" | "procedure" | "part";

export function RateButton({
  kind,
  id,
  count,
}: {
  kind: Kind;
  id: string;
  count?: number;
}) {
  const [rateFault, { isLoading: loadingFault }] = useRateKnownFaultMutation();
  const [rateProcedure, { isLoading: loadingProcedure }] = useRateRepairProcedureMutation();
  const [ratePart, { isLoading: loadingPart }] = useRateModelPartMutation();
  const [voted, setVoted] = useState(false);

  const loading =
    kind === "fault" ? loadingFault : kind === "procedure" ? loadingProcedure : loadingPart;
  const display = (count ?? 0) + (voted ? 1 : 0);

  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1 text-fg-muted"
      disabled={loading || voted}
      onClick={async () => {
        if (voted || loading) return;
        setVoted(true);
        try {
          if (kind === "fault") await rateFault(id).unwrap();
          else if (kind === "procedure") await rateProcedure(id).unwrap();
          else await ratePart(id).unwrap();
        } catch {
          setVoted(false);
        }
      }}
    >
      <ThumbsUp className="size-3.5" />
      Helpful
      {display > 0 && <span className="tabular-nums">{display}</span>}
    </Button>
  );
}
