import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  AgentConfigSchema,
  RepoMappingSchema,
  type AgentConfig,
} from "../../shared/types.js";

const CONFIG_FILENAME = ".claude-agent.yml";
const REPOS_FILENAME = "repos.yml";

// ─── Load repos.yml (team → repo mapping) ──────────────────────

export async function resolveRepoForTeam(teamKey: string): Promise<string> {
  const configPath = resolve(REPOS_FILENAME);

  let raw: string;
  try {
    raw = await readFile(configPath, "utf-8");
  } catch {
    throw new Error(
      `No ${REPOS_FILENAME} found at ${configPath}. Create it from repos.yml.example.`
    );
  }

  const mapping = RepoMappingSchema.parse(parseYaml(raw));
  const entry = mapping.teams[teamKey];

  if (!entry) {
    throw new Error(
      `No repo configured for team "${teamKey}" in ${REPOS_FILENAME}. Available teams: ${Object.keys(mapping.teams).join(", ")}`
    );
  }

  return entry.repo;
}

// ─── Load .claude-agent.yml (per-repo config) ──────────────────

export async function loadConfig(repoDir: string, repoUrl?: string): Promise<AgentConfig> {
  const configPath = join(repoDir, CONFIG_FILENAME);

  let raw: string;
  try {
    raw = await readFile(configPath, "utf-8");
  } catch {
    console.log(`[config] No ${CONFIG_FILENAME} in ${repoDir} — using defaults`);
    return AgentConfigSchema.parse({ repo: repoUrl ?? "unknown" });
  }

  const parsed = parseYaml(raw);
  return AgentConfigSchema.parse(parsed);
}
