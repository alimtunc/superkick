import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { LinearIssue, PRResult, WorktreeInfo } from "../../shared/types.js";

const exec = promisify(execFile);

export async function createPR(
  worktree: WorktreeInfo,
  issue: LinearIssue,
  baseBranch: string
): Promise<PRResult | null> {
  const cwd = worktree.path;

  // Stage and commit all changes
  await exec("git", ["add", "-A"], { cwd });

  const { stdout: diffStat } = await exec("git", ["diff", "--cached", "--stat"], { cwd });
  if (!diffStat.trim()) {
    console.log("[github] No changes to commit — agent produced no diff");
    return null;
  }

  await exec(
    "git",
    ["commit", "-m", `feat: ${issue.title}\n\nResolves ${issue.identifier}\n\nAutomated by agent-daemon`],
    { cwd }
  );

  // Push
  await exec("git", ["push", "-u", "origin", worktree.branch], { cwd });

  // Create PR via gh CLI
  const title = `${issue.identifier}: ${issue.title}`;
  const body = [
    `## ${issue.identifier}`,
    "",
    issue.description ?? "_No description_",
    "",
    `[Linear Issue](${issue.url})`,
    "",
    "---",
    "_Automated by agent-daemon_",
  ].join("\n");

  const { stdout: prUrl } = await exec(
    "gh",
    [
      "pr", "create",
      "--title", title,
      "--body", body,
      "--base", baseBranch,
      "--head", worktree.branch,
    ],
    { cwd }
  );

  // Extract PR number from URL
  const prNumber = parseInt(prUrl.trim().split("/").pop() ?? "0", 10);

  console.log(`[github] PR created: ${prUrl.trim()}`);

  return {
    url: prUrl.trim(),
    number: prNumber,
    title,
  };
}
