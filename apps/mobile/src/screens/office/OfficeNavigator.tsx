import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { JobDTO } from "@nnact/shared";
import type { StoredStaffSession } from "../../auth-storage";
import type { Appointment as FieldAppointment, DiagnosticListItem } from "../../hooks/useFieldData";
import type { Palette } from "../../theme";
import { OfficeHome } from "./OfficeHome";
import { DispatchScreen } from "./Dispatch";
import { CustomersScreen, CustomerDetailScreen } from "./Customers";
import { BillingScreen, EstimateScreen, InvoiceScreen } from "./Billing";
import { JobsScreen } from "./Jobs";
import { EstimateDocumentScreen, type DocumentKind } from "./EstimateDocument";
import { PlansScreen } from "./Plans";
import { FinanceScreen } from "./Finance";
import { TeamScreen } from "./Team";
import { BusinessSettingsScreen } from "./BusinessSettings";
import { ReportsScreen } from "./Reports";

export type OfficeRoute =
  | { name: "home" }
  | { name: "dispatch" }
  | { name: "customers" }
  | { name: "customer"; customerId: string }
  | { name: "billing" }
  | { name: "estimate"; estimateId: string }
  | { name: "invoice"; invoiceId: string }
  | { name: "document"; kind: DocumentKind; documentId: string }
  | { name: "jobs" }
  | { name: "plans" }
  | { name: "finance" }
  | { name: "team" }
  | { name: "settings" }
  | { name: "reports" };

export function OfficeNavigator({
  colors,
  session,
  jobs,
  appointments,
  diagnostics,
  loading,
  refreshing,
  onRefresh,
  onOpenNotifications,
  onOpenJob,
}: {
  colors: Palette;
  session: StoredStaffSession;
  jobs: JobDTO[];
  appointments: FieldAppointment[];
  diagnostics: DiagnosticListItem[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenNotifications: () => void;
  onOpenJob: (jobId: string) => void;
}) {
  const [stack, setStack] = useState<OfficeRoute[]>([{ name: "home" }]);
  const route = stack[stack.length - 1];

  const nav = useMemo(
    () => ({
      push: (next: OfficeRoute) => setStack((current) => [...current, next]),
      pop: () => setStack((current) => (current.length > 1 ? current.slice(0, -1) : current)),
      replace: (next: OfficeRoute) => setStack((current) => [...current.slice(0, -1), next]),
    }),
    [],
  );

  return (
    <View style={styles.root}>
      {route.name === "home" ? (
        <OfficeHome
          colors={colors}
          session={session}
          jobs={jobs}
          appointments={appointments}
          diagnostics={diagnostics}
          loading={loading}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onOpenNotifications={onOpenNotifications}
          onOpenJob={onOpenJob}
          nav={nav}
        />
      ) : null}
      {route.name === "dispatch" ? (
        <DispatchScreen colors={colors} session={session} jobs={jobs} refreshing={refreshing} onRefresh={onRefresh} onOpenJob={onOpenJob} nav={nav} />
      ) : null}
      {route.name === "customers" ? <CustomersScreen colors={colors} session={session} nav={nav} /> : null}
      {route.name === "customer" ? <CustomerDetailScreen colors={colors} session={session} customerId={route.customerId} nav={nav} onOpenJob={onOpenJob} /> : null}
      {route.name === "billing" ? <BillingScreen colors={colors} session={session} jobs={jobs} nav={nav} onRefresh={onRefresh} /> : null}
      {route.name === "estimate" ? <EstimateScreen colors={colors} session={session} estimateId={route.estimateId} jobs={jobs} nav={nav} onRefresh={onRefresh} /> : null}
      {route.name === "invoice" ? <InvoiceScreen colors={colors} session={session} invoiceId={route.invoiceId} jobs={jobs} nav={nav} onRefresh={onRefresh} /> : null}
      {route.name === "jobs" ? <JobsScreen colors={colors} session={session} onOpenJob={onOpenJob} nav={nav} /> : null}
      {route.name === "document" ? <EstimateDocumentScreen colors={colors} session={session} kind={route.kind} documentId={route.documentId} jobs={jobs} nav={nav} /> : null}
      {route.name === "plans" ? <PlansScreen colors={colors} session={session} nav={nav} /> : null}
      {route.name === "finance" ? <FinanceScreen colors={colors} session={session} nav={nav} /> : null}
      {route.name === "team" ? <TeamScreen colors={colors} session={session} nav={nav} /> : null}
      {route.name === "settings" ? <BusinessSettingsScreen colors={colors} session={session} nav={nav} /> : null}
      {route.name === "reports" ? <ReportsScreen colors={colors} session={session} nav={nav} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});