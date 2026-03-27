import { Hono } from "hono";
import { Client, Connection } from "@temporalio/client";
import { getEnv } from "../shared/env.js";
import { readLogs, getLogPath } from "../shared/logs.js";
import { readFile, stat } from "node:fs/promises";
import { watch } from "node:fs";
import { streamSSE } from "hono/streaming";

export const dashboardApi = new Hono();

// ─── Temporal client (lazy singleton) ───────────────────────────

let _client: Client | null = null;

async function getClient(): Promise<Client> {
  if (!_client) {
    const env = getEnv();
    const connection = await Connection.connect({ address: env.TEMPORAL_ADDRESS });
    _client = new Client({ connection, namespace: env.TEMPORAL_NAMESPACE });
  }
  return _client;
}

// ─── Types ──────────────────────────────────────────────────────

interface WorkflowSummary {
  workflowId: string;
  issueId: string;
  status: string;
  startTime: string | null;
  closeTime: string | null;
  taskQueue: string;
}

// ─── GET /api/workflows — list all workflows ────────────────────

dashboardApi.get("/api/workflows", async (c) => {
  try {
    const client = await getClient();
    const workflows: WorkflowSummary[] = [];

    const iter = client.workflow.list({
      query: 'WorkflowType = "issueWorkflow"',
    });

    for await (const wf of iter) {
      workflows.push({
        workflowId: wf.workflowId,
        issueId: wf.workflowId.replace("issue-", ""),
        status: wf.status.name,
        startTime: wf.startTime?.toISOString() ?? null,
        closeTime: wf.closeTime?.toISOString() ?? null,
        taskQueue: wf.taskQueue,
      });
    }

    // Most recent first
    workflows.sort((a, b) => {
      const ta = a.startTime ?? "";
      const tb = b.startTime ?? "";
      return tb.localeCompare(ta);
    });

    return c.json(workflows);
  } catch (err: any) {
    console.error("[dashboard] Failed to list workflows:", err.message);
    return c.json({ error: "Failed to list workflows", details: err.message }, 500);
  }
});

// ─── GET /api/workflows/:id — workflow detail ───────────────────

dashboardApi.get("/api/workflows/:id", async (c) => {
  const workflowId = c.req.param("id");

  try {
    const client = await getClient();
    const handle = client.workflow.getHandle(workflowId);
    const desc = await handle.describe();
    const logs = await readLogs(workflowId);

    return c.json({
      workflowId: desc.workflowId,
      status: desc.status.name,
      startTime: desc.startTime?.toISOString() ?? null,
      closeTime: desc.closeTime?.toISOString() ?? null,
      taskQueue: desc.taskQueue,
      logs,
    });
  } catch (err: any) {
    return c.json({ error: "Workflow not found", details: err.message }, 404);
  }
});

// ─── GET /api/workflows/:id/logs — SSE stream ──────────────────

dashboardApi.get("/api/workflows/:id/logs", async (c) => {
  const workflowId = c.req.param("id");
  const logFilePath = getLogPath(workflowId);

  return streamSSE(c, async (stream) => {
    // Send existing logs first
    let offset = 0;
    try {
      const content = await readFile(logFilePath, "utf-8");
      const lines = content.split("\n").filter(Boolean);
      for (const line of lines) {
        await stream.writeSSE({ data: line, event: "log" });
      }
      offset = content.length;
    } catch {
      // File doesn't exist yet, will start watching
    }

    // Watch for new lines
    let closed = false;

    stream.onAbort(() => {
      closed = true;
    });

    // Poll for new content (fs.watch is unreliable across platforms for appends)
    while (!closed) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        const fileStat = await stat(logFilePath);
        if (fileStat.size > offset) {
          const content = await readFile(logFilePath, "utf-8");
          const newContent = content.slice(offset);
          const lines = newContent.split("\n").filter(Boolean);
          for (const line of lines) {
            await stream.writeSSE({ data: line, event: "log" });
          }
          offset = content.length;
        }
      } catch {
        // File not created yet, keep waiting
      }
    }
  });
});

// ─── POST /api/workflows/:id/cancel — cancel a workflow ────────

dashboardApi.post("/api/workflows/:id/cancel", async (c) => {
  const workflowId = c.req.param("id");

  try {
    const client = await getClient();
    const handle = client.workflow.getHandle(workflowId);
    await handle.cancel();
    return c.json({ cancelled: true, workflowId });
  } catch (err: any) {
    return c.json({ error: "Failed to cancel", details: err.message }, 500);
  }
});
