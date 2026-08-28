import type { ImageSourcePropType } from "react-native";

export type FieldCarouselSlide = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  image: ImageSourcePropType;
  badge?: string;
};

export const FIELD_TOOLS_SLIDES: FieldCarouselSlide[] = [
  {
    id: "diagnostics",
    eyebrow: "Repair Brain",
    title: "Guided diagnostics",
    description: "Run validated workflows, capture measurements, and escalate when coverage is missing.",
    image: require("../../assets/carousel/tech-diagnostics.png"),
  },
  {
    id: "route",
    eyebrow: "Daily route",
    title: "Plan your visits",
    description: "See today's appointments in order with job status and arrival windows.",
    image: require("../../assets/carousel/tech-route.png"),
  },
  {
    id: "workflows",
    eyebrow: "Validated workflows",
    title: "Institutional knowledge",
    description: "Every visit builds on verified field knowledge from previous NNACT repairs.",
    image: require("../../assets/carousel/tech-workflows.png"),
  },
  {
    id: "offline",
    eyebrow: "Low-signal sites",
    title: "Offline field packages",
    description: "Download jobs, queue readings, and sync automatically when connectivity returns.",
    image: require("../../assets/carousel/tech-offline-sync.png"),
  },
];

export const NNACT_BUEA_SLIDES: FieldCarouselSlide[] = [
  {
    id: "workshop",
    eyebrow: "NNACT Buea",
    title: "Bonduma workshop",
    description: "Tarred Bonduma Street, Bokwai Garage — Southwest Cameroon's technical service hub.",
    image: require("../../assets/photos/nnact-buea-workshop.jpg"),
  },
  {
    id: "hvac",
    eyebrow: "Field service",
    title: "HVAC in the field",
    description: "Air conditioning installation, repair, and maintenance for homes and businesses.",
    image: require("../../assets/photos/nnact-hvac-service.jpg"),
  },
  {
    id: "cold-room",
    eyebrow: "Commercial refrigeration",
    title: "Cold room commissioning",
    description: "Industrial refrigeration systems designed and installed across Southwest Cameroon.",
    image: require("../../assets/photos/nnact-cold-room.jpg"),
  },
];

export function buildFieldToolsSlides(activeDiagnostics?: number, queuedWrites?: number): FieldCarouselSlide[] {
  return FIELD_TOOLS_SLIDES.map((slide) => {
    if (slide.id === "diagnostics" && activeDiagnostics) {
      return { ...slide, badge: `${activeDiagnostics} active` };
    }
    if (slide.id === "offline" && queuedWrites) {
      return { ...slide, badge: `${queuedWrites} queued` };
    }
    return slide;
  });
}
