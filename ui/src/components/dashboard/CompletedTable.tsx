import { Link } from "react-router-dom";
import type { Run } from "../../types";
import { fmtDuration } from "./utils";
import { SectionTitle } from "./SectionTitle";

function fmtRunDuration(r: Run): string {
  if (!r.finished_at) return "--";
  return fmtDuration(new Date(r.finished_at).getTime() - new Date(r.started_at).getTime());
}

export function CompletedTable({ completed }: { completed: Run[] }) {
  return (
    <section className="fade-up delay-4">
      <SectionTitle title="COMPLETED" accent="mineral" count={completed.length} />
      {completed.length === 0 ? (
        <p className="text-dim text-sm font-data">No completed runs.</p>
      ) : (
        <div className="panel overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-edge text-dim font-data text-[10px] uppercase tracking-wider">
                <th className="text-left px-3 py-2">Issue</th>
                <th className="text-left px-3 py-2 hidden sm:table-cell">Repo</th>
                <th className="text-left px-3 py-2">Duration</th>
                <th className="text-left px-3 py-2 hidden md:table-cell">Branch</th>
                <th className="text-right px-3 py-2">Finished</th>
              </tr>
            </thead>
            <tbody>
              {completed
                .sort((a, b) => new Date(b.finished_at!).getTime() - new Date(a.finished_at!).getTime())
                .slice(0, 15)
                .map((run) => (
                  <tr key={run.id} className="border-b border-edge/50 hover:bg-slate-deep/50 transition-colors">
                    <td className="px-3 py-2">
                      <Link to={`/runs/${run.id}`} className="font-data text-mineral hover:text-neon-green transition-colors">
                        {run.issue_identifier}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-silver hidden sm:table-cell">{run.repo_slug}</td>
                    <td className="px-3 py-2 font-data text-fog">{fmtRunDuration(run)}</td>
                    <td className="px-3 py-2 font-data text-dim truncate max-w-40 hidden md:table-cell">{run.branch_name ?? "--"}</td>
                    <td className="px-3 py-2 text-right font-data text-dim">
                      {run.finished_at ? new Date(run.finished_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "--"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
