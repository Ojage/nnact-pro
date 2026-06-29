export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-3xl mb-3 opacity-30">◇</div>
      <p className="text-sm text-fg-muted font-medium">{title}</p>
      {description && <p className="text-xs text-fg-dim mt-1">{description}</p>}
    </div>
  );
}
