import type { FastifyRequest } from "fastify";
import { and, asc, eq } from "drizzle-orm";
import { catalogCategories, catalogItems, db, orgs } from "@nnact/db";
import {
  NNACT_COMPANY,
  buildGoogleMapsDirectionsToAddress,
  buildGoogleMapsDirectionsUrl,
  buildGoogleMapsUrl,
  buildWhatsAppUrl,
  mergeBusinessSettings,
  type PublicBookingConfigDTO,
  type PublicMarketingProfileDTO,
} from "@nnact/shared";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const DAY_SCHEMA: Record<string, string> = {
  mon: "Mo",
  tue: "Tu",
  wed: "We",
  thu: "Th",
  fri: "Fr",
  sat: "Sa",
  sun: "Su",
};

function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

function formatTimeLabel(hhmm: string): string {
  const [hourPart, minutePart] = hhmm.split(":");
  const hour = Number(hourPart);
  const minute = Number(minutePart ?? 0);
  if (Number.isNaN(hour)) return hhmm;
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

function formatMarketingHours(
  businessHours: PublicBookingConfigDTO["businessHours"],
): PublicMarketingProfileDTO["hours"] {
  const start = formatTimeLabel(businessHours.startTime);
  const end = formatTimeLabel(businessHours.endTime);
  const range = `${start} - ${end}`;
  const workDays = businessHours.workDays;
  const weekdayKeys = workDays.filter((day) => day !== "sat" && day !== "sun");
  const hasSat = workDays.includes("sat");
  const hasSun = workDays.includes("sun");

  let weekdayLabel = "Monday - Friday";
  if (weekdayKeys.length === 1) weekdayLabel = "Monday";
  else if (weekdayKeys.length >= 5 && !hasSat && !hasSun) weekdayLabel = "Monday - Friday";
  else if (hasSat && !hasSun) weekdayLabel = "Monday - Saturday";

  const schemaDays = workDays.map((day) => DAY_SCHEMA[day] ?? day).join(",");
  const schemaTimes = `${businessHours.startTime}-${businessHours.endTime}`;

  return {
    weekdays: `${weekdayLabel}: ${range}`,
    saturday: hasSat ? `Saturday: ${range}` : null,
    sunday: hasSun ? `Sunday: ${range}` : "Sunday: Emergency services only",
    emergency: "24/7 emergency service available",
    schema: schemaDays ? `${schemaDays} ${schemaTimes}` : `Mo-Sa ${schemaTimes}`,
  };
}

function marketingLocation(org: typeof orgs.$inferSelect): PublicMarketingProfileDTO["location"] {
  const base = NNACT_COMPANY.location;
  const fullAddress = org.publicAddress ?? [
    base.streetAddress,
    base.addressLocality,
    base.addressRegion,
    "Cameroon",
  ].join(", ");

  return {
    streetAddress: base.streetAddress,
    city: base.addressLocality,
    region: base.addressRegion,
    country: "Cameroon",
    fullAddress,
    geo: { ...base.geo },
  };
}

function marketingSocial(primaryPhone: string): PublicMarketingProfileDTO["social"] {
  return {
    facebook: process.env.MARKETING_FACEBOOK_URL ?? "https://facebook.com/profile.php?id=61578183762045",
    whatsApp: buildWhatsAppUrl(primaryPhone),
    linkedin: process.env.MARKETING_LINKEDIN_URL ?? "https://cm.linkedin.com/company/nnact",
  };
}

function divisionsAsCategories(): PublicBookingConfigDTO["serviceCategories"] {
  return NNACT_COMPANY.divisions.map((division) => ({
    id: slugify(division.name),
    label: division.name,
    services: [...division.services],
  }));
}

export function resolvePublicApiOrigin(req?: FastifyRequest): string {
  const configured = process.env.PUBLIC_API_URL?.replace(/\/$/, "");
  if (configured) return configured;
  if (req) {
    const forwardedProto = req.headers["x-forwarded-proto"];
    const proto = typeof forwardedProto === "string" ? forwardedProto.split(",")[0]?.trim() : req.protocol;
    const forwardedHost = req.headers["x-forwarded-host"];
    const host = typeof forwardedHost === "string" ? forwardedHost.split(",")[0]?.trim() : req.hostname;
    return `${proto}://${host}`;
  }
  return "http://localhost:3001";
}

export function publicLogoUrl(orgId: string, origin: string): string {
  return `${origin}/api/public/${orgId}/logo`;
}

export async function serviceCategoriesForOrg(orgId: string): Promise<PublicBookingConfigDTO["serviceCategories"]> {
  const categories = await db
    .select()
    .from(catalogCategories)
    .where(eq(catalogCategories.orgId, orgId))
    .orderBy(asc(catalogCategories.name));

  if (categories.length === 0) return divisionsAsCategories();

  const items = await db
    .select()
    .from(catalogItems)
    .where(and(eq(catalogItems.orgId, orgId), eq(catalogItems.active, true)))
    .orderBy(asc(catalogItems.name));

  return categories
    .map((category) => ({
      id: category.id,
      label: category.name,
      services: items.filter((item) => item.categoryId === category.id).map((item) => item.name),
    }))
    .filter((category) => category.services.length > 0);
}

async function featuredServicesForOrg(orgId: string): Promise<PublicMarketingProfileDTO["featuredServices"]> {
  const categories = await db
    .select()
    .from(catalogCategories)
    .where(eq(catalogCategories.orgId, orgId))
    .orderBy(asc(catalogCategories.name));

  if (categories.length === 0) {
    return NNACT_COMPANY.divisions.slice(0, 4).map((division) => ({
      id: slugify(division.services[0] ?? division.name),
      title: division.services[0] ?? division.name,
      description: division.name,
      categoryLabel: division.name,
    }));
  }

  const items = await db
    .select()
    .from(catalogItems)
    .where(and(eq(catalogItems.orgId, orgId), eq(catalogItems.active, true)))
    .orderBy(asc(catalogItems.name));

  const featured: PublicMarketingProfileDTO["featuredServices"] = [];
  for (const category of categories) {
    const item = items.find((row) => row.categoryId === category.id);
    if (!item) continue;
    featured.push({
      id: item.id,
      title: item.name,
      description: item.description ?? category.description ?? category.name,
      categoryLabel: category.name,
    });
    if (featured.length >= 4) break;
  }
  return featured;
}

export async function bookingConfigForOrg(org: typeof orgs.$inferSelect): Promise<PublicBookingConfigDTO> {
  const settings = mergeBusinessSettings(org.businessSettings);
  return {
    org: {
      id: org.id,
      name: org.name,
      publicEmail: org.publicEmail,
      publicPhone: org.publicPhone,
      publicAddress: org.publicAddress,
    },
    serviceCategories: await serviceCategoriesForOrg(org.id),
    serviceAreas: settings.serviceAreas.length ? settings.serviceAreas : [...NNACT_COMPANY.serviceAreas],
    businessHours: settings.businessHours,
    emergencyPhone: org.publicPhone ?? NNACT_COMPANY.contact.phones[0] ?? null,
  };
}

export async function marketingProfileForOrg(
  org: typeof orgs.$inferSelect,
  req?: FastifyRequest,
): Promise<PublicMarketingProfileDTO> {
  const booking = await bookingConfigForOrg(org);
  const origin = resolvePublicApiOrigin(req);
  const phones = [
    ...(org.publicPhone ? [org.publicPhone] : []),
    ...NNACT_COMPANY.contact.phones.filter((phone) => phone !== org.publicPhone),
  ];
  const primaryPhone = phones[0] ?? NNACT_COMPANY.contact.phones[0];
  const location = marketingLocation(org);
  const website = process.env.MARKETING_WEBSITE_URL?.replace(/\/$/, "") ?? "https://nnact.com";

  return {
    ...booking,
    company: {
      legalName: org.name || NNACT_COMPANY.legalName,
      shortName: NNACT_COMPANY.shortName,
      tagline: NNACT_COMPANY.tagline,
      motto: NNACT_COMPANY.motto,
      customerPromise: NNACT_COMPANY.customerPromise,
    },
    brandColor: org.brandColor ?? "#0B5FFF",
    logoUrl: publicLogoUrl(org.id, origin),
    phones,
    email: org.publicEmail ?? NNACT_COMPANY.contact.email,
    website,
    featuredServices: await featuredServicesForOrg(org.id),
    location,
    hours: formatMarketingHours(booking.businessHours),
    contact: {
      whatsAppPhone: phoneDigits(primaryPhone),
      whatsAppUrl: buildWhatsAppUrl(primaryPhone),
      mapsUrl: buildGoogleMapsUrl(),
      mapsDirectionsUrl: org.publicAddress
        ? buildGoogleMapsDirectionsToAddress(org.publicAddress)
        : buildGoogleMapsDirectionsUrl(),
    },
    social: marketingSocial(primaryPhone),
  };
}
