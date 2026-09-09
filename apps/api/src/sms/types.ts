/**
 * SMS abstraction — pluggable provider contracts.
 *
 * The API layer talks to ISmsSender; concrete providers (EtechKeys today,
 * Infobip / EchoSMS later) implement the same contract and are resolved via
 * SmsService.resolveSender().
 */

/** Options accepted by every SMS provider. */
export interface SendSMSOptions {
  /** Single recipient E.164 number, or a batch of recipients for bulk sends. */
  to: string | string[];
  /** Message body. */
  message: string;
  /** Maps to the provider's sender id (e.g. "ETECH KEYS"). Defaults to a configured value. */
  from?: string;
}

/** A sender idempotently delivers a message. */
export interface ISmsSender {
  sendSMS(options: SendSMSOptions): Promise<void>;
}

export const SMS_PROVIDERS = ["etechkeys", "infobip", "echosms"] as const;
export type SmsProvider = (typeof SMS_PROVIDERS)[number];

export function isSmsProvider(value: unknown): value is SmsProvider {
  return typeof value === "string" && (SMS_PROVIDERS as readonly string[]).includes(value);
}

/** Raised by senders; `statusCode` mirrors an HTTP status for route handlers. */
export class SmsError extends Error {
  statusCode: number;
  provider: string;
  constructor(message: string, statusCode = 500, provider = "sms") {
    super(message);
    this.name = "SmsError";
    this.statusCode = statusCode;
    this.provider = provider;
  }
}