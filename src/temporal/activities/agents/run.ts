import { spawn } from "node:child_process";
import type { AgentConfig, AgentResult, LinearIssue, WorktreeInfo } from "../../../shared/types.js";
import { appendLog } from "../../../shared/logs.js";

// ─── Prompt builder ─────────────────────────────────────────────

function buildPrompt(issue: LinearIssue, config: AgentConfig): string {
  const parts: string[] = [];

  if (config.context) {
    parts.push(`## Project Context\n${config.context}`);
  }

  parts.push(`## Issue: ${issue.identifier} — ${issue.title}`);

  if (issue.description) {
    parts.push(`## Description\n${issue.description}`);
  }

  const instructions = [
    "## Instructions",
    "Implement the changes described in this issue.",
    "Write clean, production-ready code following existing project conventions.",
  ];

  if (config.test_command) {
    instructions.push(`Run \`${config.test_command}\` to verify your changes. Fix any failing tests.`);
  }

  if (config.lint_command) {
    instructions.push(`Run \`${config.lint_command}\` and fix any lint errors.`);
  }

  parts.push(instructions.join("\n"));

  return parts.join("\n\n");
}

// ─── Resolve command for agent ──────────────────────────────────

function resolveCommand(agent: string, config: AgentConfig): string {
  if (agent === config.default_agent) {
    return config.command;
  }

  switch (agent) {
    case "claude":
      return "claude --dangerously-skip-permissions";
    case "codex":
      return "codex --full-auto";
    default:
      throw new Error(`Unknown agent "${agent}". Supported: claude, codex`);
  }
}

// ─── Stream log line ────────────────────────────────────────────

function logLine(
  workflowId: string,
  level: "stdout" | "stderr" | "info",
  message: string
): void {
  appendLog({
    ts: new Date().toISOString(),
    workflowId,
    step: "agent",
    level,
    message,
  }).catch(() => {});
}

// ─── Parse Claude stream-json events ────────────────────────────

function parseClaudeEvent(workflowId: string, json: string): void {
  try {
    const event = JSON.parse(json);

    switch (event.type) {
      case "assistant": {
        // Claude's text output
        const text = event.message?.content
          ?.filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
          .join("");
        if (text?.trim()) {
          // Log first 500 chars of each assistant message
          logLine(workflowId, "stdout", text.slice(0, 500));
        }
        break;
      }
      case "content_block_start": {
        if (event.content_block?.type === "tool_use") {
          logLine(workflowId, "info", `Tool: ${event.content_block.name}`);
        }
        break;
      }
      case "result": {
        const cost = event.cost_usd ? `$${event.cost_usd.toFixed(4)}` : "";
        const duration = event.duration_ms ? `${Math.round(event.duration_ms / 1000)}s` : "";
        logLine(workflowId, "info", `Result: ${event.subtype ?? "done"} ${cost} ${duration}`.trim());
        break;
      }
      case "system": {
        if (event.subtype === "init") {
          logLine(workflowId, "info", `Claude session: ${event.session_id ?? "started"}`);
        }
        break;
      }
    }
  } catch {
    // Not valid JSON, log raw
    if (json.trim()) logLine(workflowId, "stdout", json);
  }
}

// ─── Run agent ──────────────────────────────────────────────────

export async function runAgent(
  worktree: WorktreeInfo,
  issue: LinearIssue,
  agent: string,
  config: AgentConfig
): Promise<AgentResult> {
  const start = Date.now();
  const prompt = buildPrompt(issue, config);
  const command = resolveCommand(agent, config);
  const [cmd, ...baseArgs] = command.split(" ");

  const isClaude = agent === "claude";
  const sessionId = `agent-${worktree.issueId}`;

  // Add stream-json output + session-id for Claude
  const args = isClaude
    ? [...baseArgs, "--output-format", "stream-json", "--session-id", sessionId, "-p", prompt]
    : [...baseArgs, "-p", prompt];

  const workflowId = `issue-${worktree.issueId}`;

  logLine(workflowId, "info", `Starting ${agent}: ${cmd} ${baseArgs.join(" ")}${isClaude ? " (stream-json)" : ""}`);
  if (isClaude) {
    logLine(workflowId, "info", `📎 To join this session, run:`);
    logLine(workflowId, "info", `cd ${worktree.path} && claude --resume ${sessionId}`);
  }

  return new Promise<AgentResult>((resolve) => {
    const chunks: string[] = [];
    let stdoutBuffer = "";
    let stderrBuffer = "";
    let totalBytes = 0;

    const proc = spawn(cmd, args, {
      cwd: worktree.path,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    // Heartbeat every 30s
    const heartbeat = setInterval(() => {
      const elapsed = Math.round((Date.now() - start) / 1000);
      logLine(workflowId, "info", `Agent running... (${elapsed}s, ${totalBytes} bytes)`);
    }, 30_000);

    proc.stdout.on("data", (data: Buffer) => {
      const text = data.toString();
      chunks.push(text);
      totalBytes += data.length;

      stdoutBuffer += text;

      if (isClaude) {
        // stream-json: one JSON object per line
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() ?? "";
        for (const line of lines) {
          parseClaudeEvent(workflowId, line);
        }
      } else {
        const lines = stdoutBuffer.split(/\r?\n|\r/);
        stdoutBuffer = lines.pop() ?? "";
        for (const line of lines) {
          const clean = line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").trim();
          if (clean) logLine(workflowId, "stdout", clean);
        }
      }
    });

    proc.stderr.on("data", (data: Buffer) => {
      const text = data.toString();
      chunks.push(text);
      totalBytes += data.length;

      stderrBuffer += text;
      const lines = stderrBuffer.split(/\r?\n|\r/);
      stderrBuffer = lines.pop() ?? "";
      for (const line of lines) {
        const clean = line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").trim();
        if (clean) logLine(workflowId, "stderr", clean);
      }
    });

    proc.on("close", (code) => {
      clearInterval(heartbeat);

      // Flush remaining
      if (isClaude && stdoutBuffer.trim()) {
        parseClaudeEvent(workflowId, stdoutBuffer);
      } else if (stdoutBuffer.trim()) {
        logLine(workflowId, "stdout", stdoutBuffer.trim());
      }
      if (stderrBuffer.trim()) logLine(workflowId, "stderr", stderrBuffer.trim());

      const output = chunks.join("");
      const durationMs = Date.now() - start;

      logLine(workflowId, "info", `Agent finished (exit=${code}, ${Math.round(durationMs / 1000)}s, ${totalBytes} bytes)`);
      console.log(`[${agent}] finished (exit=${code}, ${Math.round(durationMs / 1000)}s)`);

      resolve({
        success: code === 0,
        agent,
        output: output.slice(-5000),
        durationMs,
      });
    });

    proc.on("error", (err) => {
      clearInterval(heartbeat);
      const msg = `Failed to spawn ${agent}: ${err.message}`;
      logLine(workflowId, "info", msg);

      resolve({
        success: false,
        agent,
        output: msg,
        durationMs: Date.now() - start,
      });
    });
  });
}
