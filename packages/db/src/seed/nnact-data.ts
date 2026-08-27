import { NNACT_USER_IDS, nnactCustomerId, nnactEquipmentId, nnactEquipmentModelId, nnactJobId, nnactPropertyId } from "./ids.js";

export const NNACT_ORG = {
  name: "NNACT Home Appliance and Maintenance Services",
  timezone: "Africa/Douala",
  publicEmail: "nnactrepairs@gmail.com",
  publicPhone: "+237651385746",
  publicAddress: "Tarred Bonduma Street, Bokwai Garage, Buea, South-West, Cameroon",
  brandColor: "#0B5FFF",
  documentFooter: "NNACT — The Power of Dreams · Precision in Service, Excellence in Care.",
} as const;

export const NNACT_STAFF = [
  { id: NNACT_USER_IDS.owner, email: "salathiel.ayuk@nnact.demo", name: "Salathiel Ayuk", role: "owner" as const, skills: "Administration, reporting, Repair Brain oversight" },
  { id: NNACT_USER_IDS.dispatchGrace, email: "grace.nkweta@nnact.demo", name: "Grace Nkweta", role: "dispatcher" as const, skills: "Dispatch, scheduling, customer follow-up" },
  { id: NNACT_USER_IDS.dispatchBertrand, email: "bertrand.fonge@nnact.demo", name: "Bertrand Fonge", role: "dispatcher" as const, skills: "Operations, job intake, technician routing" },
  { id: NNACT_USER_IDS.financeClaudia, email: "claudia.ashu@nnact.demo", name: "Claudia Ashu", role: "dispatcher" as const, skills: "Finance, quotations, invoices, receipts" },
  { id: NNACT_USER_IDS.seniorEmmanuel, email: "emmanuel.tabi@nnact.demo", name: "Emmanuel Tabi", role: "technician" as const, skills: "HVAC, refrigeration, appliance diagnostics, electrical diagnostics" },
  { id: NNACT_USER_IDS.techFrankline, email: "frankline.njomo@nnact.demo", name: "Frankline Njomo", role: "technician" as const, skills: "HVAC, refrigeration, split AC" },
  { id: NNACT_USER_IDS.techDelphine, email: "delphine.ekane@nnact.demo", name: "Delphine Ekane", role: "technician" as const, skills: "Washing machines, home appliances" },
  { id: NNACT_USER_IDS.techJunior, email: "junior.mbah@nnact.demo", name: "Junior Mbah", role: "technician" as const, skills: "Electrical, generators, wiring faults" },
  { id: NNACT_USER_IDS.techRita, email: "rita.ndum@nnact.demo", name: "Rita Ndum", role: "technician" as const, skills: "Solar, inverter systems, batteries" },
  { id: NNACT_USER_IDS.techPascal, email: "pascal.enow@nnact.demo", name: "Pascal Enow", role: "technician" as const, skills: "Refrigeration, cold rooms, commercial cooling" },
];

/** XAF amounts stored as integer cents (see formatMoney / XAF minorUnits). */
export function xaf(amount: number): number {
  return amount * 100;
}

export const RESIDENTIAL_CUSTOMERS = [
  { id: nnactCustomerId(1), name: "Marie Fon", phone: "+237650010001", email: "marie.fon.demo@example.test", area: "Molyko", address: "Near University of Buea, Molyko" },
  { id: nnactCustomerId(2), name: "Joseph Nje", phone: "+237650010002", area: "Great Soppo", address: "Great Soppo, Buea" },
  { id: nnactCustomerId(3), name: "Blessing Tabe", phone: "+237650010003", email: "blessing.tabe.demo@example.test", area: "Small Soppo", address: "Small Soppo Main Road" },
  { id: nnactCustomerId(4), name: "Eric Ngwa", phone: "+237650010004", area: "Buea Town", address: "Buea Town Market Street" },
  { id: nnactCustomerId(5), name: "Florence Nkeng", phone: "+237650010005", area: "Bonduma", address: "Bonduma Phase 2" },
  { id: nnactCustomerId(6), name: "Samuel Ekobo", phone: "+237650010006", email: "samuel.ekobo.demo@example.test", area: "Bokwango", address: "Bokwango Junction" },
  { id: nnactCustomerId(7), name: "Patience Mbah", phone: "+237650010007", area: "Mile 16", address: "Mile 16 Bolifamba" },
  { id: nnactCustomerId(8), name: "Daniel Ashu", phone: "+237650010008", area: "Bomaka", address: "Bomaka New Layout" },
  { id: nnactCustomerId(9), name: "Grace Enow", phone: "+237650010009", area: "Molyko", address: "Molyko Check Point" },
  { id: nnactCustomerId(10), name: "Peter Nkweta", phone: "+237650010010", area: "Great Soppo", address: "Great Soppo Hillside" },
  { id: nnactCustomerId(11), name: "Ruth Fonge", phone: "+237650010011", email: "ruth.fonge.demo@example.test", area: "Bonduma", address: "Bonduma Tarred Street" },
  { id: nnactCustomerId(12), name: "Andrew Tabi", phone: "+237650010012", area: "Buea Town", address: "Buea Town Clerks Quarter" },
] as const;

export const COMMERCIAL_CUSTOMERS = [
  { id: nnactCustomerId(13), name: "Summit View Guest House (Demo)", contact: "Manager Linda", phone: "+237650020001", email: "demo.summitview@example.test", area: "Molyko", address: "Molyko, Buea", type: "Guest house" },
  { id: nnactCustomerId(14), name: "Green Plate Restaurant (Demo)", contact: "Chef Roland", phone: "+237650020002", email: "demo.greenplate@example.test", area: "Buea Town", address: "Buea Town Commercial Avenue", type: "Restaurant" },
  { id: nnactCustomerId(15), name: "FreshBake Mini Mart (Demo)", contact: "Owner Patricia", phone: "+237650020003", area: "Bonduma", address: "Bonduma Market Road", type: "Bakery / mini supermarket" },
  { id: nnactCustomerId(16), name: "CarePlus Pharmacy (Demo)", contact: "Pharmacist James", phone: "+237650020004", email: "demo.careplus@example.test", area: "Great Soppo", address: "Great Soppo Health Row", type: "Pharmacy" },
  { id: nnactCustomerId(17), name: "Atlantic Office Suites (Demo)", contact: "Facilities Lead Nora", phone: "+237650020005", email: "demo.atlantic@example.test", area: "Molyko", address: "Molyko Business Park", type: "Office" },
  { id: nnactCustomerId(18), name: "CamCold Processing Ltd (Demo)", contact: "Plant Engineer Victor", phone: "+237650020006", email: "demo.camcold@example.test", area: "Bokwango", address: "Bokwango Industrial Zone", type: "Processing / cold storage" },
  { id: nnactCustomerId(19), name: "Hilltop Hotel & Events (Demo)", contact: "Operations Manager Irene", phone: "+237650020007", email: "demo.hilltop@example.test", area: "Buea Town", address: "Buea Town Hilltop Road", type: "Hotel" },
  { id: nnactCustomerId(20), name: "SunGrid Solar Hub (Demo)", contact: "Technical Lead Oscar", phone: "+237650020008", email: "demo.sungrid@example.test", area: "Mile 16", address: "Mile 16 Solar Street", type: "Solar retail / install" },
] as const;

export const EQUIPMENT_MODELS = [
  { id: nnactEquipmentModelId(1), manufacturer: "Samsung", modelNumber: "WW90T4040CE", modelName: "EcoBubble Washing Machine 9kg", category: "washing_machine", normalizedIdentifier: "samsungww90t4040ce" },
  { id: nnactEquipmentModelId(2), manufacturer: "LG", modelNumber: "GC-B247SLUV", modelName: "InstaView Refrigerator", category: "refrigerator", normalizedIdentifier: "lggcb247sluv" },
  { id: nnactEquipmentModelId(3), manufacturer: "Daikin", modelNumber: "FTKF35", modelName: "Split AC 1.5HP", category: "ac_unit", normalizedIdentifier: "daikinftkf35" },
  { id: nnactEquipmentModelId(4), manufacturer: "Daikin", modelNumber: "FTKF50", modelName: "Split AC 2HP", category: "ac_unit", normalizedIdentifier: "daikinftkf50" },
  { id: nnactEquipmentModelId(5), manufacturer: "Cworth", modelNumber: "CW-HYB-5K", modelName: "5kW Hybrid Inverter", category: "inverter", normalizedIdentifier: "cworthcwhyb5k" },
  { id: nnactEquipmentModelId(6), manufacturer: "Whirlpool", modelNumber: "WTL7000", modelName: "Top Load Washer 7kg", category: "washing_machine", normalizedIdentifier: "whirlpoolwtl7000" },
  { id: nnactEquipmentModelId(7), manufacturer: "Hisense", modelNumber: "FRZ-420", modelName: "Commercial Display Freezer", category: "freezer", normalizedIdentifier: "hisensefrz420" },
  { id: nnactEquipmentModelId(8), manufacturer: "Perkins", modelNumber: "404D-22G", modelName: "Standby Generator 22kVA", category: "generator", normalizedIdentifier: "perkins404d22g" },
] as const;

export const NNACT_PROPERTIES = [
  ...RESIDENTIAL_CUSTOMERS.map((row, index) => ({
    id: nnactPropertyId(index + 1),
    customerId: row.id,
    address: `${row.address}, Buea, South-West, Cameroon`,
  })),
  { id: nnactPropertyId(13), customerId: nnactCustomerId(13), address: "Summit View Guest House, Molyko, Buea, South-West, Cameroon" },
  { id: nnactPropertyId(14), customerId: nnactCustomerId(14), address: "Green Plate Restaurant, Buea Town Commercial Avenue, Buea, South-West, Cameroon" },
  { id: nnactPropertyId(15), customerId: nnactCustomerId(15), address: "FreshBake Mini Mart, Bonduma Market Road, Buea, South-West, Cameroon" },
  { id: nnactPropertyId(16), customerId: nnactCustomerId(16), address: "CarePlus Pharmacy, Great Soppo Health Row, Buea, South-West, Cameroon" },
  { id: nnactPropertyId(17), customerId: nnactCustomerId(17), address: "Atlantic Office Suites, Molyko Business Park, Buea, South-West, Cameroon" },
  { id: nnactPropertyId(18), customerId: nnactCustomerId(17), address: "Atlantic Office Suites — Block B, Molyko, Buea, South-West, Cameroon" },
  { id: nnactPropertyId(19), customerId: nnactCustomerId(18), address: "CamCold Processing Plant, Bokwango Industrial Zone, Buea, South-West, Cameroon" },
  { id: nnactPropertyId(20), customerId: nnactCustomerId(19), address: "Hilltop Hotel & Events, Buea Town Hilltop Road, Buea, South-West, Cameroon" },
  { id: nnactPropertyId(21), customerId: nnactCustomerId(19), address: "Hilltop Hotel — Annex Block, Buea Town, South-West, Cameroon" },
  { id: nnactPropertyId(22), customerId: nnactCustomerId(20), address: "SunGrid Solar Hub, Mile 16 Solar Street, Buea, South-West, Cameroon" },
] as const;

export interface EquipmentSeedRow {
  id: string;
  customerIndex: number;
  propertyIndex: number;
  modelIndex: number;
  type: string;
  make: string;
  model: string;
  serial: string;
  condition: string;
  assetTag?: string;
}

export const EQUIPMENT_INSTANCES: EquipmentSeedRow[] = [
  { id: nnactEquipmentId(1), customerIndex: 1, propertyIndex: 1, modelIndex: 3, type: "ac_unit", make: "Daikin", model: "FTKF35", serial: "DEMO-AC-0001", condition: "GOOD" },
  { id: nnactEquipmentId(2), customerIndex: 2, propertyIndex: 2, modelIndex: 2, type: "refrigerator", make: "LG", model: "GC-B247SLUV", serial: "DEMO-RF-0002", condition: "FAIR" },
  { id: nnactEquipmentId(3), customerIndex: 3, propertyIndex: 3, modelIndex: 1, type: "washing_machine", make: "Samsung", model: "WW90T4040CE", serial: "DEMO-WM-0003", condition: "NEEDS_SERVICE" },
  { id: nnactEquipmentId(4), customerIndex: 4, propertyIndex: 4, modelIndex: 6, type: "washing_machine", make: "Whirlpool", model: "WTL7000", serial: "DEMO-WM-0004", condition: "GOOD" },
  { id: nnactEquipmentId(5), customerIndex: 5, propertyIndex: 5, modelIndex: 5, type: "inverter", make: "Cworth", model: "CW-HYB-5K", serial: "DEMO-INV-0005", condition: "UNDER_REPAIR" },
  { id: nnactEquipmentId(6), customerIndex: 6, propertyIndex: 6, modelIndex: 8, type: "generator", make: "Perkins", model: "404D-22G", serial: "DEMO-GEN-0006", condition: "FAIR" },
  { id: nnactEquipmentId(7), customerIndex: 7, propertyIndex: 7, modelIndex: 3, type: "ac_unit", make: "Daikin", model: "FTKF35", serial: "DEMO-AC-0007", condition: "GOOD" },
  { id: nnactEquipmentId(8), customerIndex: 8, propertyIndex: 8, modelIndex: 2, type: "refrigerator", make: "LG", model: "GC-B247SLUV", serial: "DEMO-RF-0008", condition: "NEEDS_SERVICE" },
  { id: nnactEquipmentId(9), customerIndex: 9, propertyIndex: 9, modelIndex: 4, type: "ac_unit", make: "Daikin", model: "FTKF50", serial: "DEMO-AC-0009", condition: "GOOD" },
  { id: nnactEquipmentId(10), customerIndex: 10, propertyIndex: 10, modelIndex: 1, type: "washing_machine", make: "Samsung", model: "WW90T4040CE", serial: "DEMO-WM-0010", condition: "FAIR" },
  { id: nnactEquipmentId(11), customerIndex: 11, propertyIndex: 11, modelIndex: 7, type: "freezer", make: "Hisense", model: "FRZ-420", serial: "DEMO-FZ-0011", condition: "GOOD" },
  { id: nnactEquipmentId(12), customerIndex: 12, propertyIndex: 12, modelIndex: 3, type: "ac_unit", make: "Daikin", model: "FTKF35", serial: "DEMO-AC-0012", condition: "NEEDS_SERVICE" },
  { id: nnactEquipmentId(13), customerIndex: 13, propertyIndex: 13, modelIndex: 3, type: "ac_unit", make: "Daikin", model: "FTKF35", serial: "DEMO-AC-1013", condition: "GOOD", assetTag: "SVG-RM101" },
  { id: nnactEquipmentId(14), customerIndex: 13, propertyIndex: 13, modelIndex: 2, type: "refrigerator", make: "LG", model: "GC-B247SLUV", serial: "DEMO-RF-1014", condition: "FAIR", assetTag: "SVG-KIT" },
  { id: nnactEquipmentId(15), customerIndex: 14, propertyIndex: 14, modelIndex: 7, type: "freezer", make: "Hisense", model: "FRZ-420", serial: "DEMO-FZ-1015", condition: "NEEDS_SERVICE" },
  { id: nnactEquipmentId(16), customerIndex: 14, propertyIndex: 14, modelIndex: 2, type: "refrigerator", make: "LG", model: "GC-B247SLUV", serial: "DEMO-RF-1016", condition: "GOOD" },
  { id: nnactEquipmentId(17), customerIndex: 15, propertyIndex: 15, modelIndex: 7, type: "freezer", make: "Hisense", model: "FRZ-420", serial: "DEMO-FZ-1017", condition: "FAIR" },
  { id: nnactEquipmentId(18), customerIndex: 16, propertyIndex: 16, modelIndex: 2, type: "refrigerator", make: "LG", model: "GC-B247SLUV", serial: "DEMO-RF-1018", condition: "GOOD" },
  { id: nnactEquipmentId(19), customerIndex: 17, propertyIndex: 17, modelIndex: 4, type: "ac_unit", make: "Daikin", model: "FTKF50", serial: "DEMO-AC-1019", condition: "GOOD" },
  { id: nnactEquipmentId(20), customerIndex: 17, propertyIndex: 18, modelIndex: 3, type: "ac_unit", make: "Daikin", model: "FTKF35", serial: "DEMO-AC-1020", condition: "FAIR" },
  { id: nnactEquipmentId(21), customerIndex: 18, propertyIndex: 19, modelIndex: 7, type: "freezer", make: "Hisense", model: "FRZ-420", serial: "DEMO-CR-1021", condition: "UNDER_REPAIR" },
  { id: nnactEquipmentId(22), customerIndex: 18, propertyIndex: 19, modelIndex: 2, type: "refrigerator", make: "LG", model: "GC-B247SLUV", serial: "DEMO-CR-1022", condition: "GOOD" },
  { id: nnactEquipmentId(23), customerIndex: 19, propertyIndex: 20, modelIndex: 4, type: "ac_unit", make: "Daikin", model: "FTKF50", serial: "DEMO-HT-1023", condition: "GOOD" },
  { id: nnactEquipmentId(24), customerIndex: 19, propertyIndex: 20, modelIndex: 8, type: "generator", make: "Perkins", model: "404D-22G", serial: "DEMO-HT-1024", condition: "FAIR" },
  { id: nnactEquipmentId(25), customerIndex: 19, propertyIndex: 21, modelIndex: 3, type: "ac_unit", make: "Daikin", model: "FTKF35", serial: "DEMO-HT-1025", condition: "GOOD" },
  { id: nnactEquipmentId(26), customerIndex: 20, propertyIndex: 22, modelIndex: 5, type: "inverter", make: "Cworth", model: "CW-HYB-5K", serial: "DEMO-SG-1026", condition: "NEEDS_SERVICE" },
  { id: nnactEquipmentId(27), customerIndex: 20, propertyIndex: 22, modelIndex: 5, type: "inverter", make: "Cworth", model: "CW-HYB-5K", serial: "DEMO-SG-1027", condition: "GOOD" },
  { id: nnactEquipmentId(28), customerIndex: 1, propertyIndex: 1, modelIndex: 2, type: "refrigerator", make: "LG", model: "GC-B247SLUV", serial: "DEMO-RF-0028", condition: "GOOD" },
  { id: nnactEquipmentId(29), customerIndex: 5, propertyIndex: 5, modelIndex: 3, type: "ac_unit", make: "Daikin", model: "FTKF35", serial: "DEMO-AC-0029", condition: "FAIR" },
  { id: nnactEquipmentId(30), customerIndex: 7, propertyIndex: 7, modelIndex: 6, type: "washing_machine", make: "Whirlpool", model: "WTL7000", serial: "DEMO-WM-0030", condition: "GOOD" },
  { id: nnactEquipmentId(31), customerIndex: 10, propertyIndex: 10, modelIndex: 8, type: "generator", make: "Perkins", model: "404D-22G", serial: "DEMO-GEN-0031", condition: "NEEDS_SERVICE" },
  { id: nnactEquipmentId(32), customerIndex: 12, propertyIndex: 12, modelIndex: 1, type: "washing_machine", make: "Samsung", model: "WW90T4040CE", serial: "DEMO-WM-0032", condition: "UNDER_REPAIR" },
  { id: nnactEquipmentId(33), customerIndex: 15, propertyIndex: 15, modelIndex: 2, type: "refrigerator", make: "LG", model: "GC-B247SLUV", serial: "DEMO-RF-1033", condition: "GOOD" },
  { id: nnactEquipmentId(34), customerIndex: 16, propertyIndex: 16, modelIndex: 3, type: "ac_unit", make: "Daikin", model: "FTKF35", serial: "DEMO-AC-1034", condition: "FAIR" },
  { id: nnactEquipmentId(35), customerIndex: 18, propertyIndex: 19, modelIndex: 4, type: "ac_unit", make: "Daikin", model: "FTKF50", serial: "DEMO-CR-1035", condition: "NEEDS_SERVICE" },
];

export interface JobSeedSpec {
  id: string;
  customerIndex: number;
  propertyIndex: number;
  equipmentIndex?: number;
  assignee: keyof typeof NNACT_USER_IDS;
  title: string;
  description: string;
  status: "lead" | "scheduled" | "in_progress" | "completed" | "canceled";
  dayOffset: number;
  hour?: number;
  totalXaf: number;
  kind: "historical" | "active" | "pm" | "today";
}

export const JOB_SPECS: JobSeedSpec[] = [
  { id: nnactJobId(1), customerIndex: 3, propertyIndex: 3, equipmentIndex: 3, assignee: "techDelphine", title: "Samsung washer not draining", description: "Water remains in drum; drain cycle fails intermittently.", status: "completed", dayOffset: -45, totalXaf: 35000, kind: "historical" },
  { id: nnactJobId(2), customerIndex: 1, propertyIndex: 1, equipmentIndex: 1, assignee: "techFrankline", title: "Split AC not cooling — Molyko residence", description: "Bedroom unit blows warm air; filters recently cleaned.", status: "completed", dayOffset: -30, totalXaf: 15000, kind: "historical" },
  { id: nnactJobId(3), customerIndex: 2, propertyIndex: 2, equipmentIndex: 2, assignee: "techPascal", title: "Refrigerator warm in fresh-food section", description: "Freezer cold, fresh-food section warming.", status: "completed", dayOffset: -28, totalXaf: 45000, kind: "historical" },
  { id: nnactJobId(4), customerIndex: 5, propertyIndex: 5, equipmentIndex: 5, assignee: "techRita", title: "Hybrid inverter not charging batteries", description: "Solar input present but battery voltage not rising.", status: "completed", dayOffset: -21, totalXaf: 55000, kind: "historical" },
  { id: nnactJobId(5), customerIndex: 6, propertyIndex: 6, equipmentIndex: 6, assignee: "techJunior", title: "Generator quarterly maintenance", description: "Oil, filters, load test, and electrical inspection.", status: "completed", dayOffset: -18, totalXaf: 40000, kind: "historical" },
  { id: nnactJobId(6), customerIndex: 14, propertyIndex: 14, equipmentIndex: 15, assignee: "techPascal", title: "Restaurant freezer compressor diagnosis", description: "Kitchen freezer not holding temperature during service hours.", status: "completed", dayOffset: -14, totalXaf: 60000, kind: "historical" },
  { id: nnactJobId(7), customerIndex: 19, propertyIndex: 20, equipmentIndex: 23, assignee: "seniorEmmanuel", title: "Hotel lobby HVAC performance audit", description: "Guest complaints about uneven cooling in lobby and event hall.", status: "completed", dayOffset: -12, totalXaf: 85000, kind: "historical" },
  { id: nnactJobId(8), customerIndex: 8, propertyIndex: 8, equipmentIndex: 8, assignee: "techPascal", title: "Domestic refrigerator sealed system check", description: "Intermittent cooling loss; suspected airflow and control issue.", status: "completed", dayOffset: -10, totalXaf: 25000, kind: "historical" },
  { id: nnactJobId(9), customerIndex: 17, propertyIndex: 17, equipmentIndex: 19, assignee: "techFrankline", title: "Office split AC preventive service", description: "Quarterly filter, coil clean, and drain flush.", status: "completed", dayOffset: -7, totalXaf: 15000, kind: "historical" },
  { id: nnactJobId(10), customerIndex: 11, propertyIndex: 11, equipmentIndex: 11, assignee: "techPascal", title: "Display freezer temperature swing", description: "Mini mart freezer cycling abnormally.", status: "completed", dayOffset: -5, totalXaf: 32000, kind: "historical" },
  { id: nnactJobId(11), customerIndex: 18, propertyIndex: 19, equipmentIndex: 21, assignee: "seniorEmmanuel", title: "Cold-room temperature instability", description: "Processing plant cold room running 4°C above setpoint.", status: "completed", dayOffset: -3, totalXaf: 120000, kind: "historical" },
  { id: nnactJobId(12), customerIndex: 4, propertyIndex: 4, equipmentIndex: 4, assignee: "techDelphine", title: "Top-load washer vibration and spin fault", description: "Machine stops on spin with imbalance warning.", status: "completed", dayOffset: -2, totalXaf: 28000, kind: "historical" },
  { id: nnactJobId(13), customerIndex: 7, propertyIndex: 7, equipmentIndex: 7, assignee: "techFrankline", title: "Residential AC electrical fault", description: "Outdoor unit trips breaker on start.", status: "in_progress", dayOffset: 0, hour: 10, totalXaf: 0, kind: "active" },
  { id: nnactJobId(14), customerIndex: 12, propertyIndex: 12, equipmentIndex: 12, assignee: "techFrankline", title: "AC preventive servicing — Bomaka", description: "Scheduled seasonal service before peak heat.", status: "scheduled", dayOffset: 1, hour: 9, totalXaf: 0, kind: "active" },
  { id: nnactJobId(15), customerIndex: 16, propertyIndex: 16, equipmentIndex: 18, assignee: "techPascal", title: "Pharmacy refrigerator alarm", description: "Vaccine fridge high-temperature alarm overnight.", status: "scheduled", dayOffset: 0, hour: 14, totalXaf: 0, kind: "active" },
  { id: nnactJobId(16), customerIndex: 20, propertyIndex: 22, equipmentIndex: 26, assignee: "techRita", title: "Inverter fault after grid outage", description: "System not reconnecting after ENEO interruption.", status: "lead", dayOffset: 2, totalXaf: 0, kind: "active" },
  { id: nnactJobId(17), customerIndex: 10, propertyIndex: 10, equipmentIndex: 31, assignee: "techJunior", title: "Generator start failure investigation", description: "Auto-start did not engage during recent outage.", status: "scheduled", dayOffset: 1, hour: 11, totalXaf: 0, kind: "active" },
  { id: nnactJobId(18), customerIndex: 9, propertyIndex: 9, equipmentIndex: 9, assignee: "techFrankline", title: "Quarterly AC preventive maintenance", description: "PM contract visit — filters, coils, drains, performance check.", status: "scheduled", dayOffset: 5, hour: 8, totalXaf: 0, kind: "pm" },
  { id: nnactJobId(19), customerIndex: 13, propertyIndex: 13, equipmentIndex: 13, assignee: "techFrankline", title: "Guest house AC PM round", description: "PM visit for guest room split units.", status: "scheduled", dayOffset: 7, hour: 9, totalXaf: 0, kind: "pm" },
  { id: nnactJobId(20), customerIndex: 6, propertyIndex: 6, equipmentIndex: 6, assignee: "techJunior", title: "Generator PM — Bokwango residence", description: "Preventive maintenance per service plan.", status: "scheduled", dayOffset: 10, hour: 10, totalXaf: 0, kind: "pm" },
  { id: nnactJobId(21), customerIndex: 1, propertyIndex: 1, equipmentIndex: 1, assignee: "techFrankline", title: "Today — Molyko AC cooling complaint", description: "Customer reports reduced cooling since yesterday.", status: "scheduled", dayOffset: 0, hour: 8, totalXaf: 0, kind: "today" },
  { id: nnactJobId(22), customerIndex: 3, propertyIndex: 3, equipmentIndex: 3, assignee: "techDelphine", title: "Today — Washer drain follow-up", description: "Verify drain repair and run test cycles on site.", status: "scheduled", dayOffset: 0, hour: 10, totalXaf: 0, kind: "today" },
  { id: nnactJobId(23), customerIndex: 15, propertyIndex: 15, equipmentIndex: 17, assignee: "techPascal", title: "Today — Bakery freezer temperature check", description: "Follow-up after recent thermostat adjustment.", status: "scheduled", dayOffset: 0, hour: 11, totalXaf: 0, kind: "today" },
  { id: nnactJobId(24), customerIndex: 5, propertyIndex: 5, equipmentIndex: 5, assignee: "techRita", title: "Today — Inverter battery charging issue", description: "Customer reports batteries not reaching full charge.", status: "scheduled", dayOffset: 0, hour: 13, totalXaf: 0, kind: "today" },
  { id: nnactJobId(25), customerIndex: 19, propertyIndex: 20, equipmentIndex: 24, assignee: "techJunior", title: "Today — Hotel generator load test", description: "Scheduled load test and transfer switch verification.", status: "scheduled", dayOffset: 0, hour: 15, totalXaf: 0, kind: "today" },
];

export const PORTAL_DEMO_CUSTOMER = {
  accountId: "b0000001-000e-4000-8000-000000000001",
  customerId: nnactCustomerId(1),
  email: "marie.fon.demo@example.test",
  name: "Marie Fon",
} as const;
