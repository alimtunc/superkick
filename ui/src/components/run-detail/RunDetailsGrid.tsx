import type { Run } from "@/types";

export function RunDetailsGrid({ run }: { run: Run }) {
  const fields = [
    { label: "ID", value: run.id },
    { label: "Repo", value: run.repo_slug },
    { label: "Branch", value: run.branch_name ?? "--" },
    { label: "Step", value: run.current_step_key ?? "--" },
    { label: "Started", value: new Date(run.started_at).toLocaleString() },
    {
      label: run.finished_at ? "Finished" : "Trigger",
      value: run.finished_at ? new Date(run.finished_at).toLocaleString() : run.trigger_source,
    },
  ];

  return (
    <div className="panel mb-6 p-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[12px]">
        {fields.map((f) => (
          <div key={f.label}>
            <dt className="font-data text-[10px] uppercase tracking-wider text-dim">{f.label}</dt>
            <dd className="font-data text-silver mt-0.5 text-[11px]">{f.value}</dd>
          </div>
        ))}
      </dl>
      {run.error_message ? (
        <p className="mt-3 rounded bg-oxide-dim border border-oxide/20 p-2 text-[12px] text-oxide font-data">
          {run.error_message}
        </p>
      ) : null}
    </div>
  );
}
