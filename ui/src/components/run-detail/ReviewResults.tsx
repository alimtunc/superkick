import type { RunStep, ReviewSwarmResult } from "@/types";

function parseReviewResult(step: RunStep): ReviewSwarmResult | null {
  if (!step.output_json) return null;
  try {
    const parsed =
      typeof step.output_json === "string" ? JSON.parse(step.output_json) : step.output_json;
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
    <div className="space-y-3 mb-6">
      {reviewSteps.map((step) => {
        const result = parseReviewResult(step);
        if (!result) {
          if (step.status === "running") {
            return (
              <div key={step.id} className="panel glow-green p-4">
                <p className="text-sm font-data text-cyan live-pulse">
                  Review swarm in progress...
                </p>
              </div>
            );
          }
          return null;
        }

        const glowClass = result.gate_passed ? "glow-green" : "glow-red";

        return (
          <div key={step.id} className={`panel ${glowClass} p-4`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-fog">Review Swarm</h3>
              <span
                className={`font-data text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${
                  result.gate_passed ? "bg-mineral-dim text-mineral" : "bg-oxide-dim text-oxide"
                }`}
              >
                {result.gate_passed ? "PASSED" : "FAILED"}
              </span>
            </div>

            <p className="font-data text-[11px] text-dim mb-3">
              {result.passed_count}/{result.total_agents} agents passed
              {result.failed_count > 0 ? ` \u00b7 ${result.failed_count} findings` : ""}
            </p>

            <div className="space-y-0.5">
              {result.findings.map((f) => (
                <div
                  key={f.session_id}
                  className="flex items-center gap-2 text-[12px] rounded border border-edge/50 bg-graphite/50 px-3 py-1.5"
                >
                  <span className={f.passed ? "text-mineral" : "text-oxide"}>
                    {f.passed ? "\u2713" : "\u2717"}
                  </span>
                  <span className="font-data text-fog">{f.agent_name}</span>
                  <span className="ml-auto font-data text-[10px] text-dim">
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
