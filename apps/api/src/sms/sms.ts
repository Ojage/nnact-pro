import type { ISmsSender, SmsProvider } from "./types.js";
import { SmsError } from "./types.js";
import { etechKeysService } from "./etech-keys.js";
import { etechKeysSettingsStore } from "./etech-keys-store.js";

const providers: Record<SmsProvider, ISmsSender> = {
  etechkeys: etechKeysService,
  // Infobip / EchoSMS adapters slot in here later.
  infobip: etechKeysService,
  echosms: etechKeysService,
};

function isConfiguredEtechKeys(): boolean {
  const cfg = {
    username: process.env.ETECH_KEYS_LOGIN?.trim(),
    password: process.env.ETECH_KEYS_PASSWORD,
    apiKey: process.env.ETECH_KEYS_API_KEY?.trim(),
  };
  return Boolean(cfg.username && cfg.password) || Boolean(cfg.apiKey);
}

/**
 * Default provider is persisted in the DB row (or the env fallbacks). When
 * EtechKeys is unconfigured, sends fail closed rather than silently dropping.
 */
export async function resolveActiveProvider(): Promise<ISmsSender> {
  const row = await etechKeysSettingsStore.resolve();
  const provider: SmsProvider = row.providerType === "etechkeys" ? "etechkeys" : "etechkeys";
  return providers[provider];
}

export function resolveSender(provider: SmsProvider): ISmsSender {
  const sender = providers[provider];
  if (!sender) throw new SmsError(`unknown SMS provider: ${provider}`, 400, "sms");
  return sender;
}

export async function sendSms(
  to: string | string[],
  message: string,
  options?: { from?: string; provider?: SmsProvider },
): Promise<void> {
  const sender = options?.provider ? resolveSender(options.provider) : await resolveActiveProvider();
  await sender.sendSMS({ to, message, from: options?.from });
  // Fire a tick on the store so any DB-persisted provider state is read next send.
  if (!options?.provider) await etechKeysSettingsStore.resolve();
}

export interface SendTestSmsResult {
  provider: SmsProvider;
  id?: string;
  creditsUsed?: number;
}

export async function sendTestSms(
  to: string,
  message: string,
  from?: string,
): Promise<SendTestSmsResult> {
  const sender = await resolveActiveProvider();
  const result = sender.sendTestSms ? await sender.sendTestSms(to, message, from) : null;
  // Fire a tick on the store so any DB-persisted provider state is read next send.
  await etechKeysSettingsStore.resolve();
  if (!result) {
    await sender.sendSMS({ to, message, from });
    return { provider: "etechkeys" };
  }
  return { provider: "etechkeys", id: result.id, creditsUsed: result.creditsUsed };
}

export function isSmsConfigured(): boolean {
  return isConfiguredEtechKeys();
}