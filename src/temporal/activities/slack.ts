import type { LinearIssue, PRResult } from "../../shared/types.js";
import { getEnv } from "../../shared/env.js";

export async function notifySlack(
  issue: LinearIssue,
  pr: PRResult | null,
  error?: string
): Promise<void> {
  const webhookUrl = getEnv().SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log("[slack] no webhook URL configured, skipping notification");
    return;
  }

  const text = pr
    ? `✅ *${issue.identifier}*: PR ready for review\n<${pr.url}|${pr.title}>\n<${issue.url}|Linear Issue>`
    : `❌ *${issue.identifier}*: Agent failed\n${error ?? "Unknown error"}\n<${issue.url}|Linear Issue>`;

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    console.error(`[slack] webhook failed: ${res.status} ${await res.text()}`);
  }
}
