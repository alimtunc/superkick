import { appendLog, type LogEntry } from "../../shared/logs.js";

export async function logWorkflowStep(
  workflowId: string,
  step: string,
  level: LogEntry["level"],
  message: string
): Promise<void> {
  await appendLog({
    ts: new Date().toISOString(),
    workflowId,
    step,
    level,
    message,
  });
}
