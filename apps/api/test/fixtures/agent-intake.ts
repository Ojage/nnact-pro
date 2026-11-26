import type { AgentLanguage, JobDraft } from "@nnact/shared";

export interface AgentFixtureMessage {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  createdAt: string;
}

export interface AgentFixtureConversation {
  id: string;
  language: AgentLanguage;
  participantPhone: string;
  messages: AgentFixtureMessage[];
  expected: JobDraft;
}

function draft(partial: Partial<JobDraft> & Pick<JobDraft, "language">): JobDraft {
  const confidence = Object.fromEntries(
    ["customerName", "phone", "town", "neighborhood", "landmarkDirections", "applianceType", "brand", "symptom", "urgency", "preferredTime"].map((field) => [field, 0.9]),
  ) as JobDraft["confidence"];
  return {
    customerName: null,
    phone: null,
    town: null,
    neighborhood: null,
    landmarkDirections: null,
    applianceType: null,
    brand: null,
    symptom: null,
    urgency: null,
    preferredTime: null,
    photoReferences: [],
    confidence,
    missingFields: [],
    safetyFlags: [],
    ...partial,
  };
}

export const agentIntakeFixtures: AgentFixtureConversation[] = [
  {
    id: "fixture-01",
    language: "en",
    participantPhone: "+10000000001",
    messages: [
      { id: "fixture-01-m1", direction: "inbound", body: "Hello, my LG washing machine is not starting and the light is not coming on.", createdAt: "2026-10-01T08:00:00.000Z" },
      { id: "fixture-01-m2", direction: "inbound", body: "My name is Customer 01, in Accra. Please call +10000000001.", createdAt: "2026-10-01T08:01:00.000Z" },
      { id: "fixture-01-m3", direction: "inbound", body: "Near the old post office. Any afternoon is fine.", createdAt: "2026-10-01T08:02:00.000Z" },
    ],
    expected: draft({
      language: "en",
      customerName: "Customer 01",
      phone: "+10000000001",
      town: "Accra",
      neighborhood: null,
      landmarkDirections: "Near the old post office",
      applianceType: "washing machine",
      brand: "LG",
      symptom: "Not starting and the light is not coming on",
      urgency: "normal",
      preferredTime: "Afternoon",
    }),
  },
  {
    id: "fixture-02",
    language: "en",
    participantPhone: "+10000000002",
    messages: [
      { id: "fixture-02-m1", direction: "inbound", body: "My Oscar twin tub washer spins clockwise but not anti clockwise.", createdAt: "2026-10-02T09:00:00.000Z" },
      { id: "fixture-02-m2", direction: "inbound", body: "I am Customer 02 in Kumasi, +10000000002.", createdAt: "2026-10-02T09:01:00.000Z" },
      { id: "fixture-02-m3", direction: "inbound", body: "The wash side motor is the problem. Opposite the market.", createdAt: "2026-10-02T09:02:00.000Z" },
    ],
    expected: draft({
      language: "en",
      customerName: "Customer 02",
      phone: "+10000000002",
      town: "Kumasi",
      landmarkDirections: "Opposite the market",
      applianceType: "twin tub washer",
      brand: "Oscar",
      symptom: "Spins clockwise but not anti clockwise",
      urgency: "normal",
    }),
  },
  {
    id: "fixture-03",
    language: "en",
    participantPhone: "+10000000003",
    messages: [
      { id: "fixture-03-m1", direction: "inbound", body: "We just installed solar and the fridge is running non stop.", createdAt: "2026-10-03T10:00:00.000Z" },
      { id: "fixture-03-m2", direction: "inbound", body: "Customer 03, Tema, +10000000003.", createdAt: "2026-10-03T10:01:00.000Z" },
      { id: "fixture-03-m3", direction: "inbound", body: "I think it needs a thermostat in series with the compressor. By the water tank.", createdAt: "2026-10-03T10:02:00.000Z" },
    ],
    expected: draft({
      language: "en",
      customerName: "Customer 03",
      phone: "+10000000003",
      town: "Tema",
      landmarkDirections: "By the water tank",
      applianceType: "fridge",
      symptom: "Running non stop after solar installation",
      urgency: "normal",
    }),
  },
  {
    id: "fixture-04",
    language: "en",
    participantPhone: "+10000000004",
    messages: [
      { id: "fixture-04-m1", direction: "inbound", body: "I need two evaporators for a 200 litre deep freezer, the biggest size.", createdAt: "2026-10-04T11:00:00.000Z" },
      { id: "fixture-04-m2", direction: "inbound", body: "Also change the filter, capillary and gas. It is R410.", createdAt: "2026-10-04T11:01:00.000Z" },
      { id: "fixture-04-m3", direction: "inbound", body: "Customer 04, Takoradi, +10000000004. Tomorrow morning is good.", createdAt: "2026-10-04T11:02:00.000Z" },
    ],
    expected: draft({
      language: "en",
      customerName: "Customer 04",
      phone: "+10000000004",
      town: "Takoradi",
      applianceType: "deep freezer",
      symptom: "Needs two evaporators, filter, capillary and R410 gas",
      urgency: "normal",
      preferredTime: "Tomorrow morning",
    }),
  },
  {
    id: "fixture-05",
    language: "fr",
    participantPhone: "+10000000005",
    messages: [
      { id: "fixture-05-m1", direction: "inbound", body: "Mon réfrigérateur ne refroidit plus du tout.", createdAt: "2026-10-05T12:00:00.000Z" },
      { id: "fixture-05-m2", direction: "inbound", body: "Je m'appelle Customer 05, je suis à Lomé. Mon numéro est +10000000005.", createdAt: "2026-10-05T12:01:00.000Z" },
      { id: "fixture-05-m3", direction: "inbound", body: "Près de la grande mosquée, s'il vous plaît.", createdAt: "2026-10-05T12:02:00.000Z" },
    ],
    expected: draft({
      language: "fr",
      customerName: "Customer 05",
      phone: "+10000000005",
      town: "Lomé",
      landmarkDirections: "Près de la grande mosquée",
      applianceType: "réfrigérateur",
      symptom: "Ne refroidit plus du tout",
      urgency: "normal",
    }),
  },
  {
    id: "fixture-06",
    language: "pidgin",
    participantPhone: "+10000000006",
    messages: [
      { id: "fixture-06-m1", direction: "inbound", body: "My fan dey make small small noise and e no dey turn well.", createdAt: "2026-10-06T13:00:00.000Z" },
      { id: "fixture-06-m2", direction: "inbound", body: "We dey call am Customer 06, we dey for Lagos, +10000000006.", createdAt: "2026-10-06T13:01:00.000Z" },
      { id: "fixture-06-m3", direction: "inbound", body: "Near the bridge. Evening time better for us.", createdAt: "2026-10-06T13:02:00.000Z" },
    ],
    expected: draft({
      language: "pidgin",
      customerName: "Customer 06",
      phone: "+10000000006",
      town: "Lagos",
      landmarkDirections: "Near the bridge",
      applianceType: "fan",
      symptom: "Dey make noise and no dey turn well",
      urgency: "normal",
      preferredTime: "Evening",
    }),
  },
  {
    id: "fixture-07",
    language: "en",
    participantPhone: "+10000000007",
    messages: [
      { id: "fixture-07-m1", direction: "inbound", body: "There are sparks from the generator and a burning smell. Please help.", createdAt: "2026-10-07T14:00:00.000Z" },
      { id: "fixture-07-m2", direction: "inbound", body: "Customer 07, Abuja, +10000000007.", createdAt: "2026-10-07T14:01:00.000Z" },
      { id: "fixture-07-m3", direction: "inbound", body: "We are beside the school. Do not come now; come later.", createdAt: "2026-10-07T14:02:00.000Z" },
    ],
    expected: draft({
      language: "en",
      customerName: "Customer 07",
      phone: "+10000000007",
      town: "Abuja",
      landmarkDirections: "Beside the school",
      applianceType: "generator",
      symptom: "Sparks and a burning smell",
      urgency: "safety",
      safetyFlags: ["sparks", "burning smell"],
    }),
  },
  {
    id: "fixture-08",
    language: "fr",
    participantPhone: "+10000000008",
    messages: [
      { id: "fixture-08-m1", direction: "inbound", body: "Il y a des étincelles et une odeur de gaz dans la cuisine.", createdAt: "2026-10-08T15:00:00.000Z" },
      { id: "fixture-08-m2", direction: "inbound", body: "Customer 08, Cotonou, +10000000008.", createdAt: "2026-10-08T15:01:00.000Z" },
      { id: "fixture-08-m3", direction: "inbound", body: "Près du marché, vers cinq heures.", createdAt: "2026-10-08T15:02:00.000Z" },
    ],
    expected: draft({
      language: "fr",
      customerName: "Customer 08",
      phone: "+10000000008",
      town: "Cotonou",
      landmarkDirections: "Près du marché",
      applianceType: "gas cooker",
      symptom: "Étincelles et odeur de gaz dans la cuisine",
      urgency: "safety",
      preferredTime: "Around five",
      safetyFlags: ["étincelles", "gaz"],
    }),
  },
  {
    id: "fixture-09",
    language: "en",
    participantPhone: "+10000000009",
    messages: [
      { id: "fixture-09-m1", direction: "inbound", body: "The water pump stopped working after the light went off.", createdAt: "2026-10-09T16:00:00.000Z" },
      { id: "fixture-09-m2", direction: "inbound", body: "Customer 09, Nairobi, +10000000009.", createdAt: "2026-10-09T16:01:00.000Z" },
      { id: "fixture-09-m3", direction: "inbound", body: "Behind the church. Morning is best.", createdAt: "2026-10-09T16:02:00.000Z" },
    ],
    expected: draft({
      language: "en",
      customerName: "Customer 09",
      phone: "+10000000009",
      town: "Nairobi",
      landmarkDirections: "Behind the church",
      applianceType: "water pump",
      symptom: "Stopped working after a power outage",
      urgency: "normal",
      preferredTime: "Morning",
    }),
  },
  {
    id: "fixture-10",
    language: "en",
    participantPhone: "+10000000010",
    messages: [
      { id: "fixture-10-m1", direction: "inbound", body: "The TV screen went black and there is a smell of smoke from the socket.", createdAt: "2026-10-10T17:00:00.000Z" },
      { id: "fixture-10-m2", direction: "inbound", body: "Customer 10, Douala, +10000000010.", createdAt: "2026-10-10T17:01:00.000Z" },
      { id: "fixture-10-m3", direction: "inbound", body: "Close to the main road. Please come today.", createdAt: "2026-10-10T17:02:00.000Z" },
    ],
    expected: draft({
      language: "en",
      customerName: "Customer 10",
      phone: "+10000000010",
      town: "Douala",
      landmarkDirections: "Close to the main road",
      applianceType: "TV",
      symptom: "Screen went black and smoke smell from the socket",
      urgency: "safety",
      safetyFlags: ["smoke"],
    }),
  },
];
