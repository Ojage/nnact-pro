import type { DiagnosticStep, TraceRoute } from "@/lib/diagnostics-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function humanize(value: string) {
  return value.replaceAll("_", " ");
}

function routeIsValidated(route: TraceRoute) {
  return (
    route.continuityValid &&
    route.disconnectedIslands === 0 &&
    route.unintendedBranches === 0 &&
    route.visualAuditStatus === "passed" &&
    route.segmentIds.length > 0
  );
}

function Endpoint({ label, value }: { label: string; value: string }) {
  return (
    <div className="w-full shrink-0 rounded-xl border border-blue/30 bg-blue/5 p-3 sm:w-44">
      <p className="text-[10px] font-bold uppercase tracking-wide text-blue">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-fg">{value}</p>
    </div>
  );
}

function SegmentChain({ route }: { route: TraceRoute }) {
  if (route.segmentIds.length === 0) {
    return (
      <div className="w-full flex-1 rounded-xl border border-dashed border-yellow/40 bg-yellow/5 p-4 text-center text-xs font-semibold text-yellow sm:min-w-48">
        No selectable segment chain attached
      </div>
    );
  }

  return (
    <div
      className="relative flex w-full flex-col items-stretch gap-2 px-2 sm:min-w-max sm:flex-1 sm:flex-row sm:items-center"
      aria-label="Ordered selectable segment chain"
    >
      <div className="absolute bottom-3 left-1/2 top-3 w-px -translate-x-1/2 bg-border-light sm:bottom-auto sm:left-3 sm:right-3 sm:top-1/2 sm:h-px sm:w-auto sm:translate-x-0 sm:-translate-y-1/2" />
      {route.segmentIds.map((segmentId, index) => (
        <div
          key={`${route.id}-${segmentId}-${index}`}
          className="relative z-10 w-full rounded-lg border border-accent/35 bg-surface-100 px-3 py-2 text-center shadow-sm sm:w-auto sm:min-w-28"
        >
          <span className="mx-auto flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-black text-surface-100">
            {index + 1}
          </span>
          <p className="mt-1 break-all font-mono text-[11px] font-semibold text-fg">{segmentId}</p>
        </div>
      ))}
    </div>
  );
}

function RouteCard({ step, route }: { step: DiagnosticStep; route: TraceRoute }) {
  const validated = routeIsValidated(route);
  const point1 = route.endpoint1 || step.point1Endpoint || step.point1Label || "Point 1 unresolved";
  const point2 = route.endpoint2 || step.point2Endpoint || step.point2Label || "Point 2 unresolved";

  return (
    <article
      className="rounded-2xl border border-border bg-surface-200 p-4"
      data-testid={`route-audit-${route.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-accent">{step.publicLabel}</p>
          <h3 className="mt-1 text-base font-bold text-fg">{route.label}</h3>
          <p className="mt-1 text-xs capitalize text-fg-muted">{humanize(route.routeKind)}</p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
            validated
              ? "border-green/30 bg-green/10 text-green"
              : "border-yellow/30 bg-yellow/10 text-yellow"
          }`}
        >
          {validated ? "Audit passed" : "Review required"}
        </span>
      </div>

      <div className="mt-4 overflow-x-auto pb-2" data-testid="ordered-segment-chain">
        <div className="flex flex-col items-stretch gap-3 sm:min-w-[760px] sm:flex-row">
          <Endpoint label="Endpoint 1" value={point1} />
          <SegmentChain route={route} />
          <Endpoint label="Endpoint 2" value={point2} />
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-lg bg-surface-100 p-2.5">
          <dt className="text-fg-dim">Continuity</dt>
          <dd className={`mt-1 font-bold ${route.continuityValid ? "text-green" : "text-yellow"}`}>
            {route.continuityValid ? "Connected" : "Broken"}
          </dd>
        </div>
        <div className="rounded-lg bg-surface-100 p-2.5">
          <dt className="text-fg-dim">Islands</dt>
          <dd className={`mt-1 font-bold ${route.disconnectedIslands === 0 ? "text-green" : "text-yellow"}`}>
            {route.disconnectedIslands}
          </dd>
        </div>
        <div className="rounded-lg bg-surface-100 p-2.5">
          <dt className="text-fg-dim">Extra branches</dt>
          <dd className={`mt-1 font-bold ${route.unintendedBranches === 0 ? "text-green" : "text-yellow"}`}>
            {route.unintendedBranches}
          </dd>
        </div>
        <div className="rounded-lg bg-surface-100 p-2.5">
          <dt className="text-fg-dim">Visual audit</dt>
          <dd className={`mt-1 font-bold capitalize ${route.visualAuditStatus === "passed" ? "text-green" : "text-yellow"}`}>
            {humanize(route.visualAuditStatus)}
          </dd>
        </div>
      </dl>

      {route.validationNotes && (
        <p className="mt-3 rounded-lg border border-border bg-surface-100 p-3 text-xs text-fg-muted">
          {route.validationNotes}
        </p>
      )}
    </article>
  );
}

export function RouteAuditPanel({ steps }: { steps: DiagnosticStep[] }) {
  const routeEntries = steps.flatMap((step) => step.routes.map((route) => ({ step, route })));
  const passed = routeEntries.filter(({ route }) => routeIsValidated(route)).length;
  const reviewRequired = routeEntries.length - passed;

  return (
    <Card className="mt-5" data-testid="route-topology-audit">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-blue">Independent route evidence</p>
            <CardTitle className="mt-1">Route topology audit</CardTitle>
            <p className="mt-2 max-w-3xl text-sm text-fg-muted">
              Endpoint pins and every selected wire segment are shown in graph order so a reviewer can independently reproduce the candidate route instead of trusting a segment count.
            </p>
          </div>
          <div className="flex gap-2 text-xs">
            <span className="rounded-full border border-green/30 bg-green/10 px-3 py-1.5 font-bold text-green">
              {passed} passed
            </span>
            <span className="rounded-full border border-yellow/30 bg-yellow/10 px-3 py-1.5 font-bold text-yellow">
              {reviewRequired} review
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {routeEntries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-fg-muted">
            No route evidence is attached to the published steps.
          </div>
        ) : (
          routeEntries.map(({ step, route }) => <RouteCard key={route.id} step={step} route={route} />)
        )}
      </CardContent>
    </Card>
  );
}
