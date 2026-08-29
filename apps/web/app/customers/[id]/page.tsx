"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { formatMoney } from "@nnact/shared";
import { useActivitiesQuery, useCustomerQuery, useJobsQuery } from "@/lib/redux/api";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTip } from "@/components/ui/info-tip";
import { JobStatusBadge } from "@/components/status-badge";
import { EditCustomerDialog } from "./edit-dialog";
import { CustomerEquipment } from "./customer-equipment";
import { CustomerServicePlans } from "./customer-service-plans";
import { CustomerPortalLinks } from "./customer-portal-links";

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const customerId = params.id;

  const { data: customer, isLoading } = useCustomerQuery(customerId, { skip: !customerId });
  const { data: allJobs = [] } = useJobsQuery();
  const { data: timeline = [] } = useActivitiesQuery({ customerId }, { skip: !customerId });
  const customerJobs = allJobs.filter((j) => j.customerId === customerId);

  if (!customer && isLoading) {
    return (
      <div>
        <Skeleton className="mb-2 h-8 w-52" />
        <Skeleton className="mb-8 h-4 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div>
      {!customer ? (
        <PageHeader title="Customer not found" description={`No customer with id ${customerId} in this org.`} />
      ) : (
        <PageHeader
          title={customer.name}
          description={`${customer.email ?? "—"} · ${customer.phone ?? "—"} · added ${new Date(customer.createdAt).toLocaleDateString()}`}
          actions={<EditCustomerDialog customer={customer} />}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Jobs */}
        <Card>
          <CardHeader>
            <CardTitle className="inline-flex items-center gap-1.5">
              Jobs ({customerJobs.length})
              <InfoTip label="About customer jobs" side="right">
                Work orders linked to this customer — open any job for line items, scheduling, diagnostics, and invoicing.
              </InfoTip>
            </CardTitle>
            <CardDescription>
              {customerJobs.length === 0
                ? "No work orders yet for this customer."
                : `${customerJobs.length} work order${customerJobs.length === 1 ? "" : "s"} on file.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {customerJobs.length === 0 ? (
              <p className="text-sm text-fg-muted py-6 text-center">No jobs for this customer.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {customerJobs.map((j) => (
                  <Link
                    key={j.id}
                    href={`/jobs/${j.id}`}
                    className="flex items-center justify-between rounded-lg bg-surface-200 px-4 py-3 transition-colors no-underline hover:bg-surface-400 hover:no-underline"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <JobStatusBadge status={j.status} />
                      <span className="text-sm text-fg truncate">{j.title}</span>
                    </div>
                    <span className="text-sm text-fg-muted shrink-0">
                      {formatMoney(j.total)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activity timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="inline-flex items-center gap-1.5">
              Activity
              <InfoTip label="About customer activity" side="right">
                Timeline of notes, status changes, payments, and other events tied to this customer across jobs and documents.
              </InfoTip>
            </CardTitle>
            <CardDescription>
              {timeline.length === 0 ? "No recorded activity yet." : "Most recent events first."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {timeline.length === 0 ? (
              <p className="text-sm text-fg-muted py-6 text-center">No activity yet.</p>
            ) : (
              <div className="relative space-y-4 border-l-2 border-surface-400 pl-5">
                {timeline.map((a) => (
                  <div key={a.id} className="relative">
                    <div className="absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-surface-300 bg-surface-500" />
                    <p className="text-sm text-fg">{a.summary}</p>
                    <p className="text-xs text-fg-dim mt-0.5">
                      {new Date(a.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CustomerServicePlans customerId={customerId} />
        <CustomerEquipment customerId={customerId} />
      </div>

      <div className="mt-6">
        <CustomerPortalLinks customerId={customerId} />
      </div>
    </div>
  );
}