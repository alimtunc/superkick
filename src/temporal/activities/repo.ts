import { execFile } from "node:child_process";
import { access, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import type { WorktreeInfo } from "../../shared/types.js";
import { getEnv } from "../../shared/env.js";

const exec = promisify(execFile);

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await exec("git", args, { cwd, maxBuffer: 10 * 1024 * 1024 });
  return stdout.trim();
}

// ─── Clone repo if not already present ──────────────────────────

export async function ensureRepo(repoUrl: string): Promise<string> {
  const env = getEnv();
  const repoName = repoUrl.split("/").pop()?.replace(".git", "") ?? "repo";
  const repoDir = resolve(env.AGENT_REPOS_DIR, repoName);

  if (await exists(join(repoDir, ".git"))) {
    await git(["fetch", "--all", "--prune"], repoDir);
    console.log(`[repo] fetched ${repoName}`);
  } else {
    await exec("git", ["clone", repoUrl, repoDir], { maxBuffer: 50 * 1024 * 1024 });
    console.log(`[repo] cloned ${repoName} → ${repoDir}`);
  }

  return repoDir;
}

// ─── Create worktree for an issue ───────────────────────────────

export async function createWorktree(
  repoDir: string,
  issueId: string,
  baseBranch: string,
  branchName: string
): Promise<WorktreeInfo> {
  const env = getEnv();
  const worktreePath = resolve(env.AGENT_WORKTREES_DIR, `issue-${issueId}`);

  // Cleanup stale worktree if exists
  if (await exists(worktreePath)) {
    await git(["worktree", "remove", worktreePath, "--force"], repoDir);
  }

  // Delete branch if it already exists (leftover from previous run)
  try {
    await git(["branch", "-D", branchName], repoDir);
  } catch {
    // Branch doesn't exist, that's fine
  }

  // Create fresh worktree from base branch
  await git(
    ["worktree", "add", "-b", branchName, worktreePath, `origin/${baseBranch}`],
    repoDir
  );

  console.log(`[repo] worktree created: ${worktreePath} (branch: ${branchName})`);

  return {
    path: worktreePath,
    branch: branchName,
    repoDir,
    issueId,
  };
}

// ─── Cleanup worktree ───────────────────────────────────────────

export async function cleanupWorktree(worktree: WorktreeInfo): Promise<void> {
  try {
    await git(["worktree", "remove", worktree.path, "--force"], worktree.repoDir);
    console.log(`[repo] worktree removed: ${worktree.path}`);
  } catch {
    // Force remove if git worktree remove fails
    await rm(worktree.path, { recursive: true, force: true });
    await git(["worktree", "prune"], worktree.repoDir);
    console.log(`[repo] worktree force-cleaned: ${worktree.path}`);
  }
}
