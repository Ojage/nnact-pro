import { eq } from "drizzle-orm";
import { NNACT_COMPANY } from "@nnact/shared";
import { catalogCategories, catalogItems, db } from "../index.js";
import { NNACT_ORG_ID } from "./ids.js";

/** Stable catalog category UUIDs for idempotent seeding. */
export const NNACT_CATALOG_CATEGORY_IDS = {
  hvac: "b0000001-0010-4000-8000-000000000001",
  electrical: "b0000001-0010-4000-8000-000000000002",
  maintenance: "b0000001-0010-4000-8000-000000000003",
  brandAc: "b0000001-0010-4000-8000-000000000004",
  commercial: "b0000001-0010-4000-8000-000000000005",
} as const;

function nnactCatalogItemId(index: number): string {
  return `b0000001-0011-4000-8000-${String(index).padStart(12, "0")}`;
}

type CatalogItemDef = { name: string; description: string };
type CatalogCategoryDef = {
  id: string;
  name: string;
  description: string;
  items: CatalogItemDef[];
};

const DIVISION_SERVICE_DESCRIPTIONS: Record<string, string> = {
  "Air conditioning installation and repair":
    "Complete air conditioning installation, maintenance, and repair solutions.",
  "Commercial and industrial HVAC": "Commercial HVAC maintenance, diagnostics, and performance tuning.",
  "Cold rooms and commercial refrigeration":
    "Commercial cold room installation and ongoing maintenance services.",
  "Automotive AC": "Automotive air conditioning diagnostics, repairs, and refrigerant refills.",
  "Refrigeration systems": "Professional refrigerator and freezer repair services for all brands and models.",
  "Electrical installation and wiring": "Licensed electrical installation, wiring faults, and panel work.",
  "Generator servicing": "Generator maintenance, fault finding, and load testing.",
  "Solar and hybrid power systems": "Solar backup design, installation, and inverter integration.",
  "Inverters and lithium batteries": "Inverter and battery diagnostics, replacement, and sizing.",
  "Power stabilization and borehole automation": "Voltage stabilization and automated borehole pump controls.",
  "Home appliance repair": "Washing machines, dryers, microwaves, ovens, and household appliances.",
  "Motors and machinery": "Motor rewinding, alignment, and industrial machinery repair.",
  "Industrial equipment": "Industrial equipment installation, commissioning, and repair.",
  "Preventive maintenance contracts": "Scheduled preventive maintenance for homes and businesses.",
  "Equipment installation and commissioning": "Professional equipment setup, testing, and handover.",
};

const BRAND_AC_ITEMS: CatalogItemDef[] = [
  {
    name: "Gree AC repair & service",
    description: "Gree split and inverter AC repair, gas refill, PCB faults, and installation in Buea.",
  },
  {
    name: "LG AC repair & service",
    description: "LG dual inverter and standard split AC diagnostics, maintenance, and repair.",
  },
  {
    name: "Samsung AC repair & service",
    description: "Samsung Wind-Free and inverter AC service, installation, and fault repair.",
  },
  {
    name: "Midea AC repair & service",
    description: "Midea split and portable AC repair — common in homes and rental properties.",
  },
  {
    name: "Haier AC repair & service",
    description: "Haier residential and light commercial AC maintenance and repair.",
  },
  {
    name: "Daikin AC repair & service",
    description: "Daikin inverter and VRV-ready split systems — gas charge, sensors, and compressors.",
  },
  {
    name: "Panasonic AC repair & service",
    description: "Panasonic inverter AC service including airflow, drain, and control faults.",
  },
  {
    name: "Hisense AC repair & service",
    description: "Hisense split AC installation, servicing, and cooling performance restoration.",
  },
  {
    name: "Carrier AC repair & service",
    description: "Carrier commercial and residential cooling units — maintenance and repair.",
  },
  {
    name: "Toshiba AC repair & service",
    description: "Toshiba split and light commercial AC diagnostics and refrigerant work.",
  },
];

const COMMERCIAL_VERTICAL_ITEMS: CatalogItemDef[] = [
  {
    name: "Restaurant refrigeration & kitchen cooling",
    description: "Walk-in coolers, display fridges, prep-line cooling, and kitchen exhaust-linked HVAC.",
  },
  {
    name: "Hotel HVAC & guest room AC maintenance",
    description: "Guest room split AC, lobby cooling, and preventive maintenance for lodges and hotels.",
  },
  {
    name: "Supermarket & retail cold chain",
    description: "Display freezers, open chillers, and back-store cold rooms for retail operators.",
  },
  {
    name: "Pharmacy & medical cold storage",
    description: "Temperature-controlled pharmacy fridges, vaccine storage, and monitoring support.",
  },
  {
    name: "Bakery & pastry display cooling",
    description: "Display chillers, proofing room ventilation, and bakery refrigeration upkeep.",
  },
  {
    name: "Poultry cold room & blast freezing",
    description: "Poultry processing cold rooms, blast freezers, and hygiene-conscious refrigeration.",
  },
  {
    name: "Fish & seafood cold storage",
    description: "Fish market and restaurant seafood cold rooms with rapid pull-down requirements.",
  },
  {
    name: "Office & building HVAC contracts",
    description: "Multi-split, cassette, and ducted systems for offices and commercial buildings.",
  },
  {
    name: "Guest house & lodge maintenance",
    description: "Preventive maintenance packages for guest houses, Airbnb blocks, and lodges.",
  },
  {
    name: "School & institutional facility HVAC",
    description: "Classroom AC, admin block cooling, and scheduled maintenance for institutions.",
  },
  {
    name: "Warehouse & logistics cold storage",
    description: "Distribution cold rooms, loading-bay doors, and industrial refrigeration upkeep.",
  },
  {
    name: "Butchery & meat processing cooling",
    description: "Meat display cases, cold rooms, and hygiene-compliant refrigeration for butcheries.",
  },
];

function divisionCategories(): CatalogCategoryDef[] {
  const divisionToCategoryId: Record<string, string> = {
    "HVAC & Refrigeration": NNACT_CATALOG_CATEGORY_IDS.hvac,
    "Electrical & Energy": NNACT_CATALOG_CATEGORY_IDS.electrical,
    "Technical Maintenance": NNACT_CATALOG_CATEGORY_IDS.maintenance,
  };

  return NNACT_COMPANY.divisions.map((division) => ({
    id: divisionToCategoryId[division.name]!,
    name: division.name,
    description: `${division.name} services offered by NNACT in Buea and Southwest Cameroon.`,
    items: division.services.map((name) => ({
      name,
      description: DIVISION_SERVICE_DESCRIPTIONS[name] ?? `${name} by NNACT.`,
    })),
  }));
}

export const NNACT_CATALOG_DEFINITION: CatalogCategoryDef[] = [
  ...divisionCategories(),
  {
    id: NNACT_CATALOG_CATEGORY_IDS.brandAc,
    name: "Brand-Specific AC",
    description: "Factory-trained diagnostics for major air conditioner brands sold in Cameroon.",
    items: BRAND_AC_ITEMS,
  },
  {
    id: NNACT_CATALOG_CATEGORY_IDS.commercial,
    name: "Commercial Verticals",
    description: "Industry-specific HVAC, refrigeration, and maintenance for businesses across Cameroon.",
    items: COMMERCIAL_VERTICAL_ITEMS,
  },
];

type DbClient = Pick<typeof db, "insert" | "delete">;

export async function seedNnactCatalog(client: DbClient = db): Promise<void> {
  let itemIndex = 1;

  for (const category of NNACT_CATALOG_DEFINITION) {
    await client
      .insert(catalogCategories)
      .values({
        id: category.id,
        orgId: NNACT_ORG_ID,
        name: category.name,
        description: category.description,
      })
      .onConflictDoUpdate({
        target: catalogCategories.id,
        set: {
          name: category.name,
          description: category.description,
        },
      });

    for (const item of category.items) {
      const itemId = nnactCatalogItemId(itemIndex++);
      await client
        .insert(catalogItems)
        .values({
          id: itemId,
          orgId: NNACT_ORG_ID,
          categoryId: category.id,
          name: item.name,
          description: item.description,
          priceCents: 0,
          costCents: 0,
          taxable: true,
          active: true,
        })
        .onConflictDoUpdate({
          target: catalogItems.id,
          set: {
            categoryId: category.id,
            name: item.name,
            description: item.description,
            active: true,
          },
        });
    }
  }
}

/** Remove NNACT catalog rows (for controlled re-seeds). */
export async function clearNnactCatalog(client: DbClient = db): Promise<void> {
  await client.delete(catalogItems).where(eq(catalogItems.orgId, NNACT_ORG_ID));
  await client.delete(catalogCategories).where(eq(catalogCategories.orgId, NNACT_ORG_ID));
}
