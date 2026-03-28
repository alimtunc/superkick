import type { RunStep, ReviewSwarmResult } from "../types";

function parseReviewResult(step: RunStep): ReviewSwarmResult | null {
  if (!step.output_json) return null;
  try {
    const parsed =
      typeof step.output_json === "string"
        ? JSON.parse(step.output_json)
        : step.output_json;
    if (parsed && Array.isArray(parsed.findings)) return parsed as ReviewSwarmResult;
    return null;
  } catch {
    return null;
  }
}

export function ReviewResults({ steps }: { steps: RunStep[] }) {
  const reviewSteps = steps.filter((s) => s.step_key === "review_swarm");
  if (reviewSteps.length === 0) return null;

  return (
    <div className="space-y-4">
      {reviewSteps.map((step) => {
        const result = parseReviewResult(step);
        if (!result) {
          if (step.status === "running") {
            return (
              <div
                key={step.id}
                className="rounded-lg border border-blue-700/50 bg-blue-900/20 p-4"
              >
                <p className="text-sm text-blue-300 animate-pulse">
                  Review swarm in progress…
                </p>
              </div>
            );
          }
          return null;
        }

        const gateBorder = result.gate_passed
          ? "border-green-700/50 bg-green-900/20"
          : "border-red-700/50 bg-red-900/20";

        return (
          <div key={step.id} className={`rounded-lg border ${gateBorder} p-4`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Review Swarm</h3>
              <span
                className={`text-xs font-mono px-2 py-0.5 rounded ${
                  result.gate_passed
                    ? "bg-green-800 text-green-300"
                    : "bg-red-800 text-red-300"
                }`}
              >
                {result.gate_passed ? "GATE PASSED" : "GATE FAILED"}
              </span>
            </div>

            <p className="text-xs text-slate-400 mb-3">
              {result.passed_count}/{result.total_agents} agents passed
              {result.failed_count > 0
                ? ` · ${result.failed_count} reported findings`
                : ""}
            </p>

            <div className="space-y-1">
              {result.findings.map((f) => (
                <div
                  key={f.session_id}
                  className="flex items-center gap-2 text-sm rounded bg-slate-800/50 px-3 py-1.5"
                >
                  <span className={f.passed ? "text-green-400" : "text-red-400"}>
                    {f.passed ? "\u2713" : "\u2717"}
                  </span>
                  <span className="font-mono text-slate-300">{f.agent_name}</span>
                  <span className="ml-auto text-xs text-slate-500 font-mono">
                    exit {f.exit_code ?? "?"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
