import { proxyActivities, log, sleep } from "@temporalio/workflow";
import type { AgentConfig, AgentResult, IssueWorkflowInput, LinearIssue, PRResult, WorktreeInfo } from "../../shared/types.js";
import type { LogEntry } from "../../shared/logs.js";

// ─── Activity proxies ───────────────────────────────────────────

const { fetchIssue, updateIssueStatus } = proxyActivities<{
  fetchIssue(issueId: string): Promise<LinearIssue>;
  updateIssueStatus(issueId: string, statusName: string): Promise<void>;
}>({ startToCloseTimeout: "30s", retry: { maximumAttempts: 3 } });

const { resolveRepoForTeam, loadConfig } = proxyActivities<{
  resolveRepoForTeam(teamKey: string): Promise<string>;
  loadConfig(repoDir: string, repoUrl?: string): Promise<AgentConfig>;
}>({ startToCloseTimeout: "10s" });

const { ensureRepo, createWorktree, cleanupWorktree } = proxyActivities<{
  ensureRepo(repoUrl: string): Promise<string>;
  createWorktree(repoDir: string, issueId: string, baseBranch: string, branchName: string): Promise<WorktreeInfo>;
  cleanupWorktree(worktree: WorktreeInfo): Promise<void>;
}>({ startToCloseTimeout: "5m", retry: { maximumAttempts: 2 } });

const { runAgent } = proxyActivities<{
  runAgent(worktree: WorktreeInfo, issue: LinearIssue, agent: string, config: AgentConfig): Promise<AgentResult>;
}>({ startToCloseTimeout: "30m" });

const { createPR } = proxyActivities<{
  createPR(worktree: WorktreeInfo, issue: LinearIssue, baseBranch: string): Promise<PRResult | null>;
}>({ startToCloseTimeout: "2m", retry: { maximumAttempts: 2 } });

const { notifySlack } = proxyActivities<{
  notifySlack(issue: LinearIssue, pr: PRResult | null, error?: string): Promise<void>;
}>({ startToCloseTimeout: "10s" });

const { logWorkflowStep } = proxyActivities<{
  logWorkflowStep(workflowId: string, step: string, level: LogEntry["level"], message: string): Promise<void>;
}>({ startToCloseTimeout: "5s" });

// ─── Helper ─────────────────────────────────────────────────────

async function emitLog(workflowId: string, step: string, message: string, level: LogEntry["level"] = "info") {
  await logWorkflowStep(workflowId, step, level, message);
}

// ─── Main workflow ──────────────────────────────────────────────

export async function issueWorkflow(input: IssueWorkflowInput): Promise<void> {
  const { issueId, agentOverride } = input;
  const workflowId = `issue-${issueId}`;

  log.info("Starting issue workflow", { issueId });
  await emitLog(workflowId, "start", `Workflow started for issue ${issueId}`);

  // 1. Fetch issue details from Linear
  await emitLog(workflowId, "fetchIssue", "Fetching issue from Linear...");
  const issue = await fetchIssue(issueId);
  log.info("Issue fetched", { identifier: issue.identifier, title: issue.title });
  await emitLog(workflowId, "fetchIssue", `Fetched: ${issue.identifier} — ${issue.title}`);

  // 2. Update Linear status → In Progress
  await emitLog(workflowId, "updateStatus", "Setting status to In Progress");
  await updateIssueStatus(issueId, "In Progress");

  // 3. Resolve repo URL from team key via repos.yml
  await emitLog(workflowId, "resolveRepo", `Resolving repo for team ${issue.teamKey}`);
  const repoUrl = await resolveRepoForTeam(issue.teamKey);
  log.info("Repo resolved", { teamKey: issue.teamKey, repoUrl });
  await emitLog(workflowId, "resolveRepo", `Repo: ${repoUrl}`);

  let worktree: WorktreeInfo | null = null;

  try {
    // 4. Clone/fetch repo
    await emitLog(workflowId, "ensureRepo", "Cloning/fetching repository...");
    const repoDir = await ensureRepo(repoUrl);
    await emitLog(workflowId, "ensureRepo", `Repo ready at ${repoDir}`);

    // 5. Load per-repo config (fallback to defaults if .claude-agent.yml missing)
    await emitLog(workflowId, "loadConfig", "Loading .claude-agent.yml...");
    const config = await loadConfig(repoDir, repoUrl);

    // 6. Resolve which agent to use (label override > config default)
    const agent = agentOverride ?? config.default_agent;
    log.info("Agent selected", { agent, source: agentOverride ? "label" : "config" });
    await emitLog(workflowId, "selectAgent", `Agent: ${agent} (source: ${agentOverride ? "label" : "config"})`);

    // 7. Create worktree
    await emitLog(workflowId, "createWorktree", `Creating worktree for branch ${issue.branchName}`);
    worktree = await createWorktree(repoDir, issueId, config.base_branch, issue.branchName);
    await emitLog(workflowId, "createWorktree", `Worktree at ${worktree.path}`);

    // 8. Run agent with retry
    let attempt = 0;
    let result: AgentResult | null = null;

    while (attempt <= config.max_retries) {
      if (attempt > 0) {
        log.warn("Retrying agent", { agent, attempt });
        await emitLog(workflowId, "agent", `Retrying agent (attempt ${attempt + 1})...`, "warn");
        await sleep("10s");
      }

      await emitLog(workflowId, "agent", `Running ${agent} (attempt ${attempt + 1}/${config.max_retries + 1})...`);
      result = await runAgent(worktree, issue, agent, config);

      if (result.success) {
        break;
      }

      attempt++;
    }

    if (!result?.success) {
      const errMsg = `Agent "${agent}" failed after ${config.max_retries} retries.`;
      await emitLog(workflowId, "agent", errMsg, "error");
      throw new Error(`${errMsg}\nOutput: ${result?.output ?? "no output"}`);
    }

    log.info("Agent completed", { agent, durationMs: result.durationMs });
    await emitLog(workflowId, "agent", `Agent completed in ${Math.round(result.durationMs / 1000)}s`);

    // 9. Create PR
    await emitLog(workflowId, "createPR", "Creating pull request...");
    const pr = await createPR(worktree, issue, config.base_branch);

    if (!pr) {
      log.warn("Agent produced no changes — skipping PR", { issueId });
      await emitLog(workflowId, "createPR", "No changes detected — skipping PR", "warn");
      await updateIssueStatus(issueId, "Todo");
      await notifySlack(issue, null, "Agent completed but produced no changes.");
      return;
    }

    log.info("PR created", { url: pr.url });
    await emitLog(workflowId, "createPR", `PR created: ${pr.url}`);

    // 10. Update Linear status → In Review
    await emitLog(workflowId, "updateStatus", "Setting status to In Review");
    await updateIssueStatus(issueId, "In Review");

    // 11. Notify Slack
    await emitLog(workflowId, "notifySlack", "Sending Slack notification");
    await notifySlack(issue, pr);

    await emitLog(workflowId, "done", "Workflow completed successfully ✓");
  } catch (err: any) {
    log.error("Workflow failed", { issueId, error: err.message });
    await emitLog(workflowId, "error", `Workflow failed: ${err.message}`, "error");

    await updateIssueStatus(issueId, "Todo");
    await notifySlack(issue, null, err.message);

    throw err;
  } finally {
    // 12. Cleanup worktree
    if (worktree) {
      await emitLog(workflowId, "cleanup", "Cleaning up worktree...");
      await cleanupWorktree(worktree);
    }
  }
}
