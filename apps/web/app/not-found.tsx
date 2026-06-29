import { Card } from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="text-center py-12 px-8 max-w-sm">
        <p className="text-3xl mb-2 opacity-30">404</p>
        <p className="text-sm text-fg-muted">Page not found</p>
      </Card>
    </div>
  );
}
