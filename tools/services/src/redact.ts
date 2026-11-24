// Log redaction. Runs on every line before it reaches disk, so logs never
// hold .env values, credentials, tokens, phone numbers or email addresses.

const PATTERNS: Array<[RegExp, string]> = [
  // Credentials inside URLs: postgres://user:secret@host
  [/([a-z][a-z0-9+.-]*:\/\/[^:/\s@]+):([^@\s/]+)@/gi, "$1:[redacted]@"],
  // Authorization headers and bearer tokens
  [/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [redacted]"],
  // JSON Web Tokens
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, "[redacted:jwt]"],
  // Well-known key shapes
  [/\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{16,}/g, "[redacted:key]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "[redacted:key]"],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, "[redacted:key]"],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/g, "[redacted:key]"],
  // key=value or "key": "value" where the key names a secret
  [
    /\b([A-Za-z0-9_.-]*(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret)[A-Za-z0-9_.-]*)(["']?\s*[:=]\s*["']?)([^\s"',;&]+)/gi,
    "$1$2[redacted]",
  ],
  // Email addresses
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[email]"],
  // International phone numbers, and Cameroon mobile numbers written locally
  [/(?<![\w.:/-])\+\d{8,15}\b/g, "[phone]"],
  [/(?<![\w.:/-])\+?237[\s-]?6\d{2}[\s-]?\d{2}[\s-]?\d{2}[\s-]?\d{2}\b/g, "[phone]"],
  [/(?<![\w.:/-])6[5-9]\d{7}\b/g, "[phone]"],
];

const NOT_SECRET = /^(?:true|false|yes|no|on|off|null|undefined|development|production|test|localhost|127\.0\.0\.1|\d+)$/i;

export class Redactor {
  private readonly literals: Array<[string, string]>;

  /** `values` are exact strings to mask, typically every value of the env file. */
  constructor(values: Record<string, string> = {}) {
    this.literals = Object.entries(values)
      .filter(([, value]) => value.length >= 6 && !NOT_SECRET.test(value))
      // Longest first, so a value that contains another is masked whole.
      .sort((a, b) => b[1].length - a[1].length)
      .map(([key, value]) => [value, `[redacted:${key}]`]);
  }

  line(text: string): string {
    let out = text;
    for (const [value, mask] of this.literals) {
      if (out.includes(value)) out = out.split(value).join(mask);
    }
    for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
    return out;
  }
}

/**
 * Splits a byte stream into lines and redacts each. A partial line is held
 * until its newline arrives, or flushed once it grows past `maxPending`.
 */
export class LineRedactor {
  private pending = "";
  private readonly redactor: Redactor;
  private readonly write: (line: string) => void;
  private readonly maxPending: number;

  constructor(redactor: Redactor, write: (line: string) => void, maxPending = 16 * 1024) {
    this.redactor = redactor;
    this.write = write;
    this.maxPending = maxPending;
  }

  push(chunk: string): void {
    this.pending += chunk;
    let index = this.pending.indexOf("\n");
    while (index >= 0) {
      this.write(this.redactor.line(this.pending.slice(0, index)) + "\n");
      this.pending = this.pending.slice(index + 1);
      index = this.pending.indexOf("\n");
    }
    if (this.pending.length > this.maxPending) this.flush();
  }

  flush(): void {
    if (this.pending) this.write(this.redactor.line(this.pending) + "\n");
    this.pending = "";
  }
}
