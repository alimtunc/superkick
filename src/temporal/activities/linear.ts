import { LinearClient } from "@linear/sdk";
import type { LinearIssue } from "../../shared/types.js";
import { getEnv } from "../../shared/env.js";

let _client: LinearClient | null = null;

function getLinearClient(): LinearClient {
  if (!_client) {
    _client = new LinearClient({ apiKey: getEnv().LINEAR_API_KEY });
  }
  return _client;
}

export async function fetchIssue(issueId: string): Promise<LinearIssue> {
  const client = getLinearClient();
  const issue = await client.issue(issueId);
  const labels = await issue.labels();
  const team = await issue.team;

  if (!team) {
    throw new Error(`Issue ${issueId} has no team`);
  }

  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description ?? null,
    url: issue.url,
    branchName: issue.branchName,
    teamKey: team.key,
    labels: labels.nodes.map((l) => l.name),
  };
}

export async function updateIssueStatus(
  issueId: string,
  statusName: string
): Promise<void> {
  const client = getLinearClient();
  const issue = await client.issue(issueId);
  const team = await issue.team;
  if (!team) return;

  const states = await team.states();
  const state = states.nodes.find(
    (s) => s.name.toLowerCase() === statusName.toLowerCase()
  );

  if (state) {
    await client.updateIssue(issueId, { stateId: state.id });
  }
}
