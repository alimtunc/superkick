import crypto from "node:crypto";
import { Hono } from "hono";
import { Client, Connection } from "@temporalio/client";
import { getEnv } from "../shared/env.js";
import { LinearWebhookPayloadSchema, type IssueWorkflowInput } from "../shared/types.js";

export const linearWebhook = new Hono();

const AGENT_LABEL_PREFIX = "agent";

// ─── Signature verification ─────────────────────────────────────

function verifyLinearSignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(body);
  const expected = hmac.digest("hex");
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

// ─── Parse agent from labels ────────────────────────────────────
// "agent" → { isAgent: true, override: null }
// "agent:claude" → { isAgent: true, override: "claude" }
// "agent:codex" → { isAgent: true, override: "codex" }

function parseAgentLabel(
  labels: Array<{ id: string; name: string }> | undefined
): { isAgent: boolean; override: string | null } {
  if (!labels) return { isAgent: false, override: null };

  for (const label of labels) {
    const name = label.name.toLowerCase().trim();
    if (name === AGENT_LABEL_PREFIX) {
      return { isAgent: true, override: null };
    }
    if (name.startsWith(`${AGENT_LABEL_PREFIX}:`)) {
      const override = name.slice(AGENT_LABEL_PREFIX.length + 1).trim();
      return { isAgent: true, override: override || null };
    }
  }

  return { isAgent: false, override: null };
}

// ─── Temporal client (lazy singleton) ───────────────────────────

let _temporalClient: Client | null = null;

async function getTemporalClient(): Promise<Client> {
  if (!_temporalClient) {
    const env = getEnv();
    const connection = await Connection.connect({
      address: env.TEMPORAL_ADDRESS,
    });
    _temporalClient = new Client({
      connection,
      namespace: env.TEMPORAL_NAMESPACE,
    });
  }
  return _temporalClient;
}

// ─── Route ──────────────────────────────────────────────────────

linearWebhook.post("/linear", async (c) => {
  const env = getEnv();

  // 1. Verify signature
  const signature = c.req.header("linear-signature");
  if (!signature) {
    return c.json({ error: "Missing signature" }, 401);
  }

  const rawBody = await c.req.text();
  if (!verifyLinearSignature(rawBody, signature, env.LINEAR_WEBHOOK_SECRET)) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  // 2. Parse & validate payload
  const body = JSON.parse(rawBody);
  const parsed = LinearWebhookPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid payload", details: parsed.error.flatten() }, 400);
  }

  const payload = parsed.data;

  // 3. Check for agent label and extract override
  const { isAgent, override } = parseAgentLabel(payload.data.labels);

  if (payload.type !== "Issue" || !isAgent) {
    return c.json({ ignored: true, reason: "Not an issue with agent label" });
  }

  // 4. Start Temporal workflow
  try {
    const client = await getTemporalClient();
    const workflowId = `issue-${payload.data.id}`;

    const input: IssueWorkflowInput = {
      issueId: payload.data.id,
      agentOverride: override,
      webhookPayload: payload,
    };

    await client.workflow.start("issueWorkflow", {
      taskQueue: env.TEMPORAL_TASK_QUEUE,
      workflowId,
      args: [input],
    });

    const agentInfo = override ? ` (agent: ${override})` : "";
    console.log(`[webhook] started workflow ${workflowId} for ${payload.data.identifier}${agentInfo}`);
    return c.json({ started: true, workflowId, agent: override });
  } catch (err: any) {
    if (err?.name === "WorkflowExecutionAlreadyStartedError") {
      return c.json({ started: false, reason: "Workflow already running" });
    }
    console.error("[webhook] failed to start workflow:", err);
    return c.json({ error: "Failed to start workflow" }, 500);
  }
});
