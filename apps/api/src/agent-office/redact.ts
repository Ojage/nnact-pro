// Redaction for Agent Office telemetry. Applied by the API to every step
// summary and log line before it is stored, so the owner's page never shows a
// phone number, an email, a credential or a customer's own words by default.
// Raw run content stays in agent_runs and is shown only through the
// audit-logged reveal.

const MAX_LENGTH = 500;

const PATTERNS: Array<[RegExp, string]> = [
  [/([a-z][a-z0-9+.-]*:\/\/[^:/\s@]+):([^@\s/]+)@/gi, "$1:[redacted]@"],
  [/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [redacted]"],
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, "[redacted]"],
  [/\b(?:sk|pk|rk)-(?:ant-|proj-|live-|test-)?[A-Za-z0-9_-]{16,}/g, "[redacted]"],
  [/\bEAA[A-Za-z0-9]{20,}/g, "[redacted]"],
  [
    /\b([A-Za-z0-9_.-]*(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)[A-Za-z0-9_.-]*)(["']?\s*[:=]\s*["']?)([^\s"',;&]+)/gi,
    "$1$2[redacted]",
  ],
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[email]"],
  // International (+…), 237-prefixed, and local Cameroon mobile numbers (6XX XX XX XX).
  [/(?<![\w.:/-])\+\d(?:[\s-]?\d){7,14}\b/g, "[phone]"],
  [/(?<![\w.:/-])(?:00)?237[\s-]?6\d{2}(?:[\s-]?\d{2}){3}\b/g, "[phone]"],
  [/(?<![\w.:/-])6[5-9]\d(?:[\s-]?\d{2}){3}\b/g, "[phone]"],
  // Quoted text is treated as a message body: customers' words never reach logs.
  [/"[^"\n]{12,}"/g, '"[text]"'],
  [/“[^”\n]{12,}”/g, "“[text]”"],
];

/** Keys whose values are personal data or content; dropped from structured fields. */
const SENSITIVE_KEYS = /^(?:name|full_?name|customer_?name|contact|phone|msisdn|email|address|service_?address|body|text|message|transcript|caption|content|prompt|input|output)$/i;

export function redactText(value: string): string {
  let out = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
  return out.length > MAX_LENGTH ? `${out.slice(0, MAX_LENGTH - 1)}…` : out;
}

/**
 * Render structured fields as `key=value` pairs, dropping sensitive keys
 * entirely and redacting the rest.
 */
export function redactFields(fields: Record<string, unknown> | undefined): string {
  if (!fields) return "";
  const parts: string[] = [];
  for (const [key, raw] of Object.entries(fields)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(key)) continue;
    if (SENSITIVE_KEYS.test(key)) {
      parts.push(`${key}=[redacted]`);
      continue;
    }
    if (raw === null || raw === undefined) continue;
    const value = typeof raw === "string" ? raw : typeof raw === "number" || typeof raw === "boolean" ? String(raw) : "[object]";
    parts.push(`${key}=${redactText(value).slice(0, 80)}`);
  }
  return parts.join(" ");
}

export function redactLine(message: string, fields?: Record<string, unknown>): string {
  const rest = redactFields(fields);
  return redactText(rest ? `${message} ${rest}` : message);
}
