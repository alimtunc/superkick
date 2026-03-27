import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { linearWebhook } from "./webhookRoute.js";
import { dashboardApi } from "./dashboardRoute.js";
import { dashboardHtml } from "./dashboardHtml.js";
import { getEnv } from "../shared/env.js";

const app = new Hono();

app.get("/health", (c) =>
  c.json({ status: "ok", timestamp: new Date().toISOString() })
);

// Dashboard
app.get("/dashboard", (c) => c.html(dashboardHtml));
app.route("/", dashboardApi);

// Webhooks
app.route("/webhook", linearWebhook);

const PORT = Number(process.env.PORT ?? 3100);

serve({ fetch: app.fetch, port: PORT }, () => {
  const env = getEnv();
  console.log(`[server] listening on :${PORT}`);
  console.log(`[server] dashboard @ http://localhost:${PORT}/dashboard`);
  console.log(`[server] temporal @ ${env.TEMPORAL_ADDRESS}`);
});
