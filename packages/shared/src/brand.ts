/** Canonical NNACT company and product identity — shared across web, mobile, and documents. */

export const NNACT_COMPANY = {
  legalName: "NNACT – Home Appliance Repairs and Maintenance Company",
  shortName: "NNACT",
  tagline: "The Power of Dreams",
  motto: "Precision in Service, Excellence in Care.",
  customerPromise: "Don't wait until equipment fails. Maintain it.",
  values: ["Dreams", "Honesty", "Integrity"] as const,
  location: {
    streetAddress: "Tarred Bonduma Street, Bokwai Garage",
    addressLocality: "Buea",
    addressRegion: "Southwest Region",
    addressCountry: "CM",
    geo: { latitude: 4.1527, longitude: 9.2419 },
  },
  contact: {
    email: "nnactrepairs@gmail.com",
    phones: ["+237 651 385 746", "+237 679 147 095", "+237 681 402 886"] as const,
    website: "https://nnactrepairs.com",
  },
  serviceAreas: ["Buea", "Southwest Cameroon", "Surrounding communities"] as const,
  divisions: [
    {
      name: "HVAC & Refrigeration",
      services: [
        "Air conditioning installation and repair",
        "Commercial and industrial HVAC",
        "Cold rooms and commercial refrigeration",
        "Automotive AC",
        "Refrigeration systems",
      ],
    },
    {
      name: "Electrical & Energy",
      services: [
        "Electrical installation and wiring",
        "Generator servicing",
        "Solar and hybrid power systems",
        "Inverters and lithium batteries",
        "Power stabilization and borehole automation",
      ],
    },
    {
      name: "Technical Maintenance",
      services: [
        "Home appliance repair",
        "Motors and machinery",
        "Industrial equipment",
        "Preventive maintenance contracts",
        "Equipment installation and commissioning",
      ],
    },
  ] as const,
} as const;

/** Opens Google Maps at the NNACT workshop. */
export function buildGoogleMapsUrl(
  location: (typeof NNACT_COMPANY)["location"] = NNACT_COMPANY.location,
): string {
  const { latitude, longitude } = location.geo;
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

/** Directions deep link — preferred for mobile "Get directions" CTAs. */
export function buildGoogleMapsDirectionsUrl(
  location: (typeof NNACT_COMPANY)["location"] = NNACT_COMPANY.location,
): string {
  const { latitude, longitude } = location.geo;
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
}

/** WhatsApp deep link for customer messaging (wa.me). */
export function buildWhatsAppUrl(phone: string, message?: string): string {
  const digits = phone.replace(/\D/g, "");
  const base = `https://wa.me/${digits}`;
  if (!message?.trim()) return base;
  return `${base}?text=${encodeURIComponent(message.trim())}`;
}

/** Google Maps directions to a street address string. */
export function buildGoogleMapsDirectionsToAddress(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address.trim())}`;
}

/** Hosted NNACT Pro API — default for mobile apps and production builds. */
export const NNACT_PRODUCTION_API_URL = "https://api.pro.nnact.com";

export const NNACT_PRODUCT = {
  name: "NNACT Pro",
  slug: "nnact-pro",
  /** Operations platform subtitle shown in app chrome. */
  subtitle: "Technical operations platform",
  /** One-line product positioning for metadata and marketing. */
  positioning:
    "Operations platform for HVAC, refrigeration, electrical, renewable energy, and field maintenance — with institutional repair intelligence built in.",
  /** Long-form description for SEO and app stores. */
  description:
    "NNACT Pro runs dispatch, CRM, estimates, invoicing, preventive maintenance, and technician workflows for NNACT's technical services divisions — HVAC, refrigeration, cold rooms, electrical, solar, generators, appliances, and commercial maintenance across Buea and Southwest Cameroon. Repair Brain captures verified field knowledge so every visit builds on the last.",
} as const;

export const NNACT_SEO_KEYWORDS = [
  "NNACT",
  "NNACT Pro",
  "HVAC Buea",
  "air conditioning repair Cameroon",
  "refrigeration services Buea",
  "cold room installation Cameroon",
  "home appliance repair Buea",
  "solar installation Southwest Cameroon",
  "generator maintenance Buea",
  "field service management",
  "preventive maintenance",
  "technical services Cameroon",
  "automotive AC Buea",
  "commercial HVAC maintenance",
  "repair knowledge base",
] as const;
