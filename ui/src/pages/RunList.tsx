import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Run } from "../types";
import { fetchRuns } from "../api";
import { RunStateBadge } from "../components/RunStateBadge";

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

export function RunList() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    fetchRuns()
      .then(setRuns)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Runs</h1>
        <button
          onClick={load}
          className="px-3 py-1.5 text-sm rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
        >
          Refresh
        </button>
      </div>

      {loading && <p className="text-slate-400">Loading…</p>}
      {error && <p className="text-red-400 text-sm">{error}</p>}

      {!loading && runs.length === 0 && !error && (
        <p className="text-slate-500">No runs yet.</p>
      )}

      <div className="space-y-2">
        {runs.map((run) => (
          <Link
            key={run.id}
            to={`/runs/${run.id}`}
            className="block rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 p-4 transition-colors"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-sm text-white">{run.issue_identifier}</span>
              <RunStateBadge state={run.state} />
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <span>{run.repo_slug}</span>
              {run.current_step_key && <span>step: {run.current_step_key}</span>}
              {!TERMINAL.has(run.state) && (
                <span className="text-blue-400">in progress</span>
              )}
              <span className="ml-auto">
                {new Date(run.started_at).toLocaleString()}
              </span>
            </div>
            {run.error_message && (
              <p className="mt-2 text-xs text-red-400 truncate">{run.error_message}</p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
