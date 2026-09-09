// SMS template send site. Re-exports the shared NNACT SMS catalog so the API
// sends exactly the same copy the settings UI and mobile apps preview, and
// adds a thin helper that renders a catalog template and delivers it through
// the active SMS provider.
import {
  SMS_TEMPLATE_CATALOG,
  SMS_TEMPLATE_SLUGS,
  lookupSmsTemplate,
  renderSmsTemplate,
  type SmsTemplateDef,
  type SmsTemplateSlug,
  type TemplateVariables,
} from "@nnact/shared";
import { sendSms } from "./sms.js";

export {
  SMS_TEMPLATE_CATALOG,
  SMS_TEMPLATE_SLUGS,
  type SmsTemplateDef,
  type SmsTemplateSlug,
  lookupSmsTemplate,
  renderSmsTemplate,
};

export type SmsTemplateVariables = Record<string, string | number | null | undefined>;

/** Renders and sends a catalog SMS template as a single message. */
export async function sendSmsTemplate(
  slug: SmsTemplateSlug,
  to: string | string[],
  variables: SmsTemplateVariables,
  options?: { from?: string },
): Promise<string> {
  const message = renderSmsTemplate(slug, variables);
  await sendSms(to, message, options);
  return message;
}