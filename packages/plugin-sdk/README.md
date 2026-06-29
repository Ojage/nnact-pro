# @ofp/plugin-sdk

Everything you need to build an [OpenFieldPro](../../README.md) plugin: verify
signed event webhooks, type the payloads, and call back into the scoped inbound
API. The SDK is the **single source of truth** for the webhook wire format — the
OFP server imports its signing from here, so verification can never drift.

## The model

1. You publish a **manifest** (`plugin.json`) declaring which events you want and
   which scopes you need.
2. An OFP org **installs** your plugin. The install mints two secrets:
   - a **webhook signing secret** (`whsec_…`) — OFP signs every delivery with it;
   - a **scoped API token** (`ofp_…`) — you use it to call back into OFP.
3. OFP **POSTs signed events** to your webhook. You verify the signature and react.

## Manifest

```ts
import { defineManifest } from "@ofp/plugin-sdk";

export default defineManifest({
  slug: "my-plugin",
  name: "My Plugin",
  version: "1.0.0",
  events: ["job.created", "invoice.paid"],
  scopes: ["customers:read"],
  webhookUrl: "https://my-plugin.example.com/webhook",
});
```

## Receiving events

```ts
import { createWebhookHandler } from "@ofp/plugin-sdk";

const handle = createWebhookHandler({
  secret: process.env.OFP_WEBHOOK_SECRET!, // the install's whsec_…
  onEvent: async (event) => {
    if (event.kind === "invoice.paid") {
      // event.data is typed: { invoiceId, number, total, jobId }
    }
  },
});

// In any framework — pass the RAW body string and the x-ofp-signature header:
const { status } = await handle(rawBody, req.headers["x-ofp-signature"]);
```

`createWebhookHandler` verifies the HMAC signature and rejects replays (5-min
default skew) before `onEvent` runs. It returns the HTTP status to reply with:
`200` ok · `401` bad/missing signature · `400` bad JSON · `500` if your handler
throws (OFP then records the delivery as failed).

## Calling back into OFP

```ts
import { OFPClient } from "@ofp/plugin-sdk";

const ofp = new OFPClient({ baseUrl: "https://app.example.com", token: process.env.OFP_TOKEN! });
await ofp.me();         // { orgId, installId, scopes }
await ofp.customers();  // requires the customers:read scope
```

## Wire format

```
header  x-ofp-signature: t=<unix_ms>,v1=<hex>
signed  `${t}.${rawBody}`
v1      HMAC-SHA256(secret, signed)
```

Verify against the **raw** body bytes — not a re-serialized object.

## Try it

A complete reference plugin lives in [`examples/webhook-receiver.ts`](./examples/webhook-receiver.ts):

```bash
OFP_WEBHOOK_SECRET=whsec_… OFP_TOKEN=ofp_… node --import tsx examples/webhook-receiver.ts
# then set a plugin install's webhook URL to http://localhost:4500
```

Run the tests: `pnpm --filter @ofp/plugin-sdk test`
