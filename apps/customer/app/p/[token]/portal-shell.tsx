import Link from "next/link";
import { NNACT_COMPANY } from "@nnact/shared";

export function PortalShell({ orgName, customerName }: { orgName: string; customerName: string }) {
  return (
    <header className="border-b border-border bg-surface-50">
      <div className="mx-auto flex h-16 w-[min(1080px,calc(100%-32px))] items-center justify-between gap-4">
        <Link href="/" className="min-w-0 no-underline">
          <p className="truncate text-sm font-bold text-fg">{orgName}</p>
          <p className="text-xs text-fg-muted">{NNACT_COMPANY.shortName} customer portal</p>
        </Link>
        <span className="text-xs text-fg-muted">Signed in as {customerName}</span>
      </div>
    </header>
  );
}
