// Reference plugin — a complete, runnable OFP integration in ~50 lines, using
// only @nnact/plugin-sdk and the Node stdlib (no framework). It proves the whole
// loop: OFP emits an event -> signed webhook -> we verify -> we call back into
// OFP's scoped API with our install token.
//
//   Run:  NNPWEBHOOK_SECRET=whsec_… NNPTOKEN=NNP… node --import tsx examples/webhook-receiver.ts
//   Then point a plugin install's webhook URL at http://localhost:4500
import { createServer } from "node:http";
import { createWebhookHandler, OFPClient, type PluginEventEnvelope } from "../src/index.js";

const SECRET = process.env.NNPWEBHOOK_SECRET ?? "whsec_dev";
const TOKEN = process.env.NNPTOKEN ?? "";
const NNPBASE = process.env.NNPBASE ?? "http://localhost:3001";
const PORT = Number(process.env.PORT ?? 4500);

const client = new OFPClient({ baseUrl: NNPBASE, token: TOKEN });

const handle = createWebhookHandler({
  secret: SECRET,
  onEvent: async (event: PluginEventEnvelope) => {
    console.log(`[plugin] ${event.kind} (org ${event.orgId})`, event.data);
    // Demonstrate the inbound API: on a new job, enrich by listing customers.
    if (event.kind === "job.created" && TOKEN) {
      try {
        const customers = await client.customers();
        console.log(`  ↳ org has ${customers.length} customers`);
      } catch (err) {
        console.log(`  ↳ inbound API call failed: ${(err as Error).message}`);
      }
    }
  },
});

createServer((req, res) => {
  if (req.method !== "POST") {
    res.writeHead(404).end();
    return;
  }
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    const result = await handle(body, req.headers["x-ofp-signature"] as string | undefined);
    res.writeHead(result.status, { "content-type": "application/json" }).end(JSON.stringify(result));
  });
}).listen(PORT, () => console.log(`reference plugin listening on http://localhost:${PORT}`));
