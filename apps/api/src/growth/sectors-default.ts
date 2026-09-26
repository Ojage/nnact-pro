// Default sector catalogue for NNACT-style commercial HVAC / maintenance outreach.

export interface DefaultSectorSeed {
  slug: string;
  name: string;
  services: string[];
  equipmentTypes: string[];
  decisionMakers: string;
  hypotheses: { text: string; supported: boolean }[];
}

export const DEFAULT_GROWTH_SECTORS: readonly DefaultSectorSeed[] = [
  {
    slug: "schools",
    name: "Schools",
    services: ["Preventive maintenance", "Split AC service", "Electrical checks"],
    equipmentTypes: ["Split units", "Package units", "Ventilation"],
    decisionMakers: "Facilities manager, bursar, head teacher",
    hypotheses: [
      { text: "Holiday periods are the best window for major HVAC work.", supported: false },
    ],
  },
  {
    slug: "hotels",
    name: "Hotels",
    services: ["Guest comfort HVAC", "Kitchen extraction", "Preventive maintenance"],
    equipmentTypes: ["VRF", "Chillers", "Split systems"],
    decisionMakers: "General manager, chief engineer, maintenance supervisor",
    hypotheses: [
      { text: "Hotels in Douala prioritize rapid response over lowest price.", supported: false },
    ],
  },
  {
    slug: "restaurants",
    name: "Restaurants",
    services: ["Kitchen ventilation", "Refrigeration", "AC maintenance"],
    equipmentTypes: ["Exhaust fans", "Walk-in coolers", "Split AC"],
    decisionMakers: "Owner, operations manager",
    hypotheses: [{ text: "Evening downtime is the main scheduling constraint.", supported: false }],
  },
  {
    slug: "banks",
    name: "Banks & financial offices",
    services: ["Branch HVAC maintenance", "UPS room cooling"],
    equipmentTypes: ["Precision AC", "Split systems"],
    decisionMakers: "Facilities coordinator, branch manager",
    hypotheses: [{ text: "Compliance documentation matters as much as price.", supported: false }],
  },
  {
    slug: "office-buildings",
    name: "Office buildings",
    services: ["Central plant maintenance", "Tenant comfort calls"],
    equipmentTypes: ["Chillers", "AHUs", "VRF"],
    decisionMakers: "Building manager, property owner",
    hypotheses: [{ text: "Multi-tenant buildings prefer consolidated billing.", supported: false }],
  },
  {
    slug: "cold-chain",
    name: "Cold-chain businesses",
    services: ["Refrigeration maintenance", "Temperature monitoring"],
    equipmentTypes: ["Cold rooms", "Compressors", "Display cases"],
    decisionMakers: "Operations director, QA manager",
    hypotheses: [{ text: "Spoilage risk makes emergency response highly valued.", supported: false }],
  },
  {
    slug: "healthcare",
    name: "Healthcare facilities",
    services: ["Clinical HVAC", "Sterile area pressure control"],
    equipmentTypes: ["AHUs", "HEPA filtration", "Split systems"],
    decisionMakers: "Hospital engineer, clinic administrator",
    hypotheses: [{ text: "Infection control drives maintenance frequency.", supported: false }],
  },
  {
    slug: "industrial",
    name: "Industrial sites",
    services: ["Process cooling", "Heavy equipment HVAC", "Energy audits"],
    equipmentTypes: ["Chillers", "Cooling towers", "Large compressors"],
    decisionMakers: "Plant manager, maintenance superintendent",
    hypotheses: [{ text: "Energy efficiency ROI is a primary entry angle.", supported: false }],
  },
];
