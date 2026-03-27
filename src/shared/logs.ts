import { appendFile, readFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";

const LOGS_DIR = resolve("./logs");

export interface LogEntry {
  ts: string;
  workflowId: string;
  step: string;
  level: "info" | "warn" | "error" | "stdout" | "stderr";
  message: string;
}

function logPath(workflowId: string): string {
  return join(LOGS_DIR, `${workflowId}.jsonl`);
}

export async function ensureLogsDir(): Promise<void> {
  if (!existsSync(LOGS_DIR)) {
    await mkdir(LOGS_DIR, { recursive: true });
  }
}

export async function appendLog(entry: LogEntry): Promise<void> {
  await ensureLogsDir();
  await appendFile(logPath(entry.workflowId), JSON.stringify(entry) + "\n");
}

export async function readLogs(workflowId: string): Promise<LogEntry[]> {
  const path = logPath(workflowId);
  try {
    const raw = await readFile(path, "utf-8");
    return raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as LogEntry);
  } catch {
    return [];
  }
}

export function getLogPath(workflowId: string): string {
  return logPath(workflowId);
}
