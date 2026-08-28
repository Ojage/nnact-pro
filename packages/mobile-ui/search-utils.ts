import { NNACT_COMPANY, type CustomerSearchResponseDTO, type MobileSearchResultItem, type StaffSearchResponseDTO } from "@nnact/shared";

const HELP_ITEMS: MobileSearchResultItem[] = [
  {
    id: "help:book",
    category: "help",
    title: "Request a service visit",
    subtitle: "Schedule HVAC, electrical, or appliance repair",
    payload: { action: "book" },
  },
  {
    id: "help:call",
    category: "help",
    title: `Call ${NNACT_COMPANY.contact.phones[0]}`,
    subtitle: "Speak with the NNACT team",
    payload: { action: "call", phone: NNACT_COMPANY.contact.phones[0] },
  },
  {
    id: "help:directions",
    category: "help",
    title: "Visit our workshop",
    subtitle: `${NNACT_COMPANY.location.streetAddress}, ${NNACT_COMPANY.location.addressLocality}`,
    payload: { action: "directions" },
  },
];

export const SEARCH_GROUP_LABELS: Record<MobileSearchResultItem["category"], string> = {
  service: "Services",
  job: "Jobs",
  customer: "Customers",
  invoice: "Invoices",
  estimate: "Estimates",
  appointment: "Appointments",
  equipment: "Equipment",
  repair_model: "Repair Brain · Models",
  repair_fault: "Repair Brain · Faults",
  repair_part: "Repair Brain · Parts",
  repair_procedure: "Repair Brain · Procedures",
  help: "Quick actions",
};

export function defaultCustomerSuggestions(): MobileSearchResultItem[] {
  const services = NNACT_COMPANY.divisions.flatMap((division) =>
    division.services.slice(0, 1).map((service) => ({
      id: `service:${division.name}:${service}`,
      category: "service" as const,
      title: service,
      subtitle: division.name,
      payload: { service, category: division.name },
    })),
  );
  return [...services, ...HELP_ITEMS].slice(0, 6);
}

export function defaultStaffSuggestions(): MobileSearchResultItem[] {
  return [
    {
      id: "help:today",
      category: "help",
      title: "Today's route",
      subtitle: "View visits and next actions",
      payload: { action: "today" },
    },
    {
      id: "help:jobs",
      category: "help",
      title: "Browse work orders",
      subtitle: "All assigned and open jobs",
      payload: { action: "jobs" },
    },
    {
      id: "help:diagnostics",
      category: "help",
      title: "Open diagnostics",
      subtitle: "Guided Repair Brain workflows",
      payload: { action: "diagnostics" },
    },
    {
      id: "help:call",
      category: "help",
      title: `Call dispatch · ${NNACT_COMPANY.contact.phones[0]}`,
      subtitle: "Workshop and routing support",
      payload: { action: "call", phone: NNACT_COMPANY.contact.phones[0] },
    },
  ];
}

export function searchLocalServices(query: string): MobileSearchResultItem[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const results: MobileSearchResultItem[] = [];
  for (const division of NNACT_COMPANY.divisions) {
    const divisionMatch = division.name.toLowerCase().includes(q);
    for (const service of division.services) {
      if (divisionMatch || service.toLowerCase().includes(q)) {
        results.push({
          id: `service:${division.name}:${service}`,
          category: "service",
          title: service,
          subtitle: division.name,
          payload: { service, category: division.name },
        });
      }
    }
  }

  for (const item of HELP_ITEMS) {
    if (item.title.toLowerCase().includes(q) || item.subtitle?.toLowerCase().includes(q)) {
      results.push(item);
    }
  }

  return results.slice(0, 8);
}

export function staffSearchToItems(data: StaffSearchResponseDTO): MobileSearchResultItem[] {
  const items: MobileSearchResultItem[] = [];

  for (const job of data.jobs) {
    items.push({
      id: `job:${job.id}`,
      category: "job",
      title: job.title,
      subtitle: job.status.replaceAll("_", " "),
      badge: job.status,
      payload: { jobId: job.id },
    });
  }
  for (const customer of data.customers) {
    items.push({
      id: `customer:${customer.id}`,
      category: "customer",
      title: customer.name,
      subtitle: customer.email ?? customer.phone ?? undefined,
      payload: { customerId: customer.id },
    });
  }
  for (const invoice of data.invoices) {
    items.push({
      id: `invoice:${invoice.id}`,
      category: "invoice",
      title: `Invoice ${invoice.number}`,
      subtitle: invoice.status.replaceAll("_", " "),
      payload: { invoiceId: invoice.id },
    });
  }
  for (const estimate of data.estimates) {
    items.push({
      id: `estimate:${estimate.id}`,
      category: "estimate",
      title: `Estimate ${estimate.number}`,
      subtitle: estimate.status.replaceAll("_", " "),
      payload: { estimateId: estimate.id },
    });
  }
  for (const appointment of data.appointments) {
    items.push({
      id: `appointment:${appointment.id}`,
      category: "appointment",
      title: appointment.jobTitle,
      subtitle: new Date(appointment.startsAt).toLocaleString(),
      payload: { appointmentId: appointment.id },
    });
  }
  for (const row of data.equipment) {
    items.push({
      id: `equipment:${row.id}`,
      category: "equipment",
      title: row.label,
      subtitle: row.serialNumber ? `S/N ${row.serialNumber}` : undefined,
      payload: { equipmentId: row.id },
    });
  }

  for (const model of data.repairBrain.models) {
    items.push({
      id: `repair_model:${model.id}`,
      category: "repair_model",
      title: [model.manufacturer, model.modelNumber].filter(Boolean).join(" ") || model.modelName || "Model",
      subtitle: model.category,
      payload: { modelId: model.id },
    });
  }
  for (const fault of data.repairBrain.faults) {
    items.push({
      id: `repair_fault:${fault.id}`,
      category: "repair_fault",
      title: fault.title,
      subtitle: fault.faultCode ?? undefined,
      payload: { faultId: fault.id },
    });
  }
  for (const part of data.repairBrain.parts) {
    items.push({
      id: `repair_part:${part.id}`,
      category: "repair_part",
      title: part.partName,
      subtitle: part.oemPartNumber ?? undefined,
      payload: { partId: part.id },
    });
  }
  for (const procedure of data.repairBrain.procedures) {
    items.push({
      id: `repair_procedure:${procedure.id}`,
      category: "repair_procedure",
      title: procedure.title,
      subtitle: procedure.type,
      payload: { procedureId: procedure.id },
    });
  }

  return items;
}

export function customerSearchToItems(data: CustomerSearchResponseDTO): MobileSearchResultItem[] {
  const items: MobileSearchResultItem[] = [];

  for (const job of data.jobs) {
    items.push({
      id: `job:${job.id}`,
      category: "job",
      title: job.title,
      subtitle: job.status.replaceAll("_", " "),
      payload: { jobId: job.id },
    });
  }
  for (const estimate of data.estimates) {
    items.push({
      id: `estimate:${estimate.id}`,
      category: "estimate",
      title: `Estimate ${estimate.number}`,
      subtitle: estimate.status.replaceAll("_", " "),
      payload: { estimateId: estimate.id },
    });
  }
  for (const invoice of data.invoices) {
    items.push({
      id: `invoice:${invoice.id}`,
      category: "invoice",
      title: `Invoice ${invoice.number}`,
      subtitle: invoice.status.replaceAll("_", " "),
      payload: { invoiceId: invoice.id },
    });
  }

  return items;
}

export function mergeSearchResults(...groups: MobileSearchResultItem[][]): MobileSearchResultItem[] {
  const seen = new Set<string>();
  const merged: MobileSearchResultItem[] = [];
  for (const group of groups) {
    for (const item of group) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged;
}

export function groupSearchResults(items: MobileSearchResultItem[]) {
  const order: MobileSearchResultItem["category"][] = [
    "help",
    "service",
    "appointment",
    "job",
    "estimate",
    "invoice",
    "customer",
    "equipment",
    "repair_model",
    "repair_fault",
    "repair_part",
    "repair_procedure",
  ];

  const buckets = new Map<MobileSearchResultItem["category"], MobileSearchResultItem[]>();
  for (const item of items) {
    const list = buckets.get(item.category) ?? [];
    list.push(item);
    buckets.set(item.category, list);
  }

  return order
    .filter((category) => buckets.has(category))
    .map((category) => ({
      title: SEARCH_GROUP_LABELS[category],
      data: buckets.get(category) ?? [],
    }));
}
