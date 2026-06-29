"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="text-center py-12 px-8 max-w-sm">
        <p className="text-3xl mb-2 opacity-30">!</p>
        <p className="text-sm text-fg-muted mb-4">Something went wrong</p>
        <p className="text-xs text-fg-dim mb-6 max-w-xs mx-auto line-clamp-2">
          {error.message}
        </p>
        <Button variant="secondary" onClick={reset}>
          Try again
        </Button>
      </Card>
    </div>
  );
}
