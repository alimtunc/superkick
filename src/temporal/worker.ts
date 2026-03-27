import { NativeConnection, Worker } from "@temporalio/worker";
import { getEnv } from "../shared/env.js";
import * as activities from "./activities/index.js";

async function main() {
  const env = getEnv();

  const connection = await NativeConnection.connect({
    address: env.TEMPORAL_ADDRESS,
  });

  const worker = await Worker.create({
    connection,
    namespace: env.TEMPORAL_NAMESPACE,
    taskQueue: env.TEMPORAL_TASK_QUEUE,
    workflowsPath: new URL("./workflows/issueWorkflow.ts", import.meta.url).pathname,
    activities,
    maxConcurrentActivityTaskExecutions: env.AGENT_MAX_PARALLEL,
  });

  console.log(`[worker] started on queue "${env.TEMPORAL_TASK_QUEUE}" (max parallel: ${env.AGENT_MAX_PARALLEL})`);

  await worker.run();
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
