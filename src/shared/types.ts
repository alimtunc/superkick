import { z } from "zod";

// ─── Linear Webhook ─────────────────────────────────────────────

export const LinearWebhookPayloadSchema = z.object({
  action: z.string(),
  type: z.string(),
  data: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable().optional(),
    url: z.string(),
    identifier: z.string(),
    branchName: z.string().optional(),
    labels: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
        })
      )
      .optional(),
    team: z
      .object({
        id: z.string(),
        key: z.string(),
        name: z.string(),
      })
      .optional(),
  }),
});

export type LinearWebhookPayload = z.infer<typeof LinearWebhookPayloadSchema>;

// ─── Linear Issue (enriched via API) ────────────────────────────

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  url: string;
  branchName: string;
  teamKey: string;
  labels: string[];
}

// ─── Repo Mapping (repos.yml) ───────────────────────────────────

export const RepoMappingSchema = z.object({
  teams: z.record(
    z.string(),
    z.object({
      repo: z.string(),
    })
  ),
});

export type RepoMapping = z.infer<typeof RepoMappingSchema>;

// ─── Repo Config (.claude-agent.yml) ────────────────────────────

export const AgentConfigSchema = z.object({
  repo: z.string(),
  base_branch: z.string().default("main"),
  test_command: z.string().optional(),
  lint_command: z.string().optional(),
  max_retries: z.number().default(2),
  default_agent: z.enum(["claude", "codex"]).default("claude"),
  command: z.string().default("claude --dangerously-skip-permissions"),
  context: z.string().optional(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// ─── Workflow Input ─────────────────────────────────────────────

export interface IssueWorkflowInput {
  issueId: string;
  agentOverride: string | null;
  webhookPayload: LinearWebhookPayload;
}

// ─── Worktree Info ──────────────────────────────────────────────

export interface WorktreeInfo {
  path: string;
  branch: string;
  repoDir: string;
  issueId: string;
}

// ─── Agent Execution Result ─────────────────────────────────────

export interface AgentResult {
  success: boolean;
  agent: string;
  output: string;
  durationMs: number;
}

// ─── PR Result ──────────────────────────────────────────────────

export interface PRResult {
  url: string;
  number: number;
  title: string;
}

// ─── Env Config ─────────────────────────────────────────────────

export const EnvSchema = z.object({
  LINEAR_WEBHOOK_SECRET: z.string().default("dev-secret"),
  LINEAR_API_KEY: z.string().min(1),
  GITHUB_TOKEN: z.string().min(1),
  SLACK_WEBHOOK_URL: z.string().url().optional().or(z.literal("")),
  TEMPORAL_ADDRESS: z.string().default("localhost:7233"),
  TEMPORAL_NAMESPACE: z.string().default("default"),
  TEMPORAL_TASK_QUEUE: z.string().default("agent-daemon"),
  AGENT_MAX_PARALLEL: z.coerce.number().default(3),
  AGENT_WORKTREES_DIR: z.string().default("./worktrees"),
  AGENT_REPOS_DIR: z.string().default("./repos"),
  CLOUDFLARE_TUNNEL_SECRET: z.string().optional(),
});

export type EnvConfig = z.infer<typeof EnvSchema>;
