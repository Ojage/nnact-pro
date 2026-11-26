import { JOB_DRAFT_KEY_FIELDS, type AgentLanguage } from "@nnact/shared";

export const EXTRACTION_SYSTEM = [
  "You extract repair-intake facts from a WhatsApp message.",
  "Return only JSON matching the requested schema.",
  "Never invent a fact; use null when absent. Set confidence between 0 and 1 for every field.",
  "Never provide prices, arrival times, or a diagnosis. Copy the customer's own wording for symptoms.",
  "Detect language as en, fr, or pidgin. Include safety flags only for sparks, burning smell, gas, or smoke.",
].join(" ");

export function extractionPrompt(input: {
  text: string;
  transcript: string | null;
  language: AgentLanguage;
  photoReferences: string[];
  safetyFlags: string[];
}): string {
  return JSON.stringify(
    {
      language: input.language,
      messageText: input.text,
      transcript: input.transcript,
      photoReferences: input.photoReferences,
      detectedSafetyFlags: input.safetyFlags,
      requiredFields: JOB_DRAFT_KEY_FIELDS,
      instruction: "Fill the JobDraft schema. photoReferences must be copied verbatim from the input.",
    },
    null,
    2,
  );
}

export const PROMPT_VERSION = "intake-2026-01";
