import { NNACT_COMPANY, NNACT_PRODUCT } from "@nnact/shared";
import { absoluteUrl, SITE_CONFIG } from "@/lib/site-metadata";

export function SiteJsonLd() {
  const siteUrl = absoluteUrl();
  const logoUrl = absoluteUrl(SITE_CONFIG.logoPath);

  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteUrl}/#organization`,
    name: NNACT_COMPANY.shortName,
    legalName: NNACT_COMPANY.legalName,
    url: NNACT_COMPANY.contact.website,
    logo: logoUrl,
    email: NNACT_COMPANY.contact.email,
    telephone: NNACT_COMPANY.contact.phones,
    slogan: NNACT_COMPANY.tagline,
    areaServed: SITE_CONFIG.serviceAreas.map((name) => ({
      "@type": "AdministrativeArea",
      name,
    })),
    address: {
      "@type": "PostalAddress",
      streetAddress: NNACT_COMPANY.location.streetAddress,
      addressLocality: NNACT_COMPANY.location.addressLocality,
      addressRegion: NNACT_COMPANY.location.addressRegion,
      addressCountry: NNACT_COMPANY.location.addressCountry,
    },
    sameAs: [NNACT_COMPANY.contact.website],
  };

  const localBusiness = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${siteUrl}/#local-business`,
    name: NNACT_COMPANY.legalName,
    image: logoUrl,
    url: NNACT_COMPANY.contact.website,
    telephone: NNACT_COMPANY.contact.phones[0],
    email: NNACT_COMPANY.contact.email,
    priceRange: "$$",
    address: organization.address,
    geo: {
      "@type": "GeoCoordinates",
      latitude: NNACT_COMPANY.location.geo.latitude,
      longitude: NNACT_COMPANY.location.geo.longitude,
    },
    areaServed: SITE_CONFIG.serviceAreas,
    knowsAbout: NNACT_COMPANY.divisions.flatMap((division) => division.services),
  };

  const webApplication = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${siteUrl}/#application`,
    name: NNACT_PRODUCT.name,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, iOS, Android",
    description: NNACT_PRODUCT.description,
    url: siteUrl,
    provider: { "@id": `${siteUrl}/#organization` },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "XAF",
      category: "Self-hosted operations platform",
    },
    featureList: [
      "Dispatch and scheduling",
      "CRM and equipment history",
      "Estimates and invoicing",
      "Preventive maintenance contracts",
      "Repair Brain institutional knowledge",
      "Technician mobile workflows",
      "HVAC and appliance diagnostics",
    ],
  };

  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl}/#website`,
    url: siteUrl,
    name: NNACT_PRODUCT.name,
    description: NNACT_PRODUCT.positioning,
    publisher: { "@id": `${siteUrl}/#organization` },
    inLanguage: "en-CM",
  };

  const graph = [organization, localBusiness, webApplication, website];

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
