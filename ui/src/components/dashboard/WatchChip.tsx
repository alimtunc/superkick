import { Button } from "@/components/ui/button";
import type { Run } from "@/types";
import { fmtElapsed, healthSignal, stepLabel } from "@/lib/domain";

interface WatchChipProps {
  run: Run;
  refTime: number;
  isFocused: boolean;
  onUnwatch: () => void;
}

const healthBarColor = {
  critical: "bg-oxide",
  warning: "bg-gold",
  ok: "bg-mineral",
} as const;

export function WatchChip({ run, refTime, isFocused, onUnwatch }: WatchChipProps) {
  const sig = healthSignal(run, refTime);
  const dotColor = healthBarColor[sig];

  return (
    <span
      className={`shrink-0 flex items-center gap-2 rounded border px-2.5 py-1 transition-colors group cursor-pointer ${
        isFocused
          ? "border-mineral/40 bg-mineral-dim ring-1 ring-mineral/20"
          : "border-edge bg-graphite hover:border-edge-bright"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${dotColor} ${sig === "critical" ? "live-pulse" : ""}`}
      />
      <span
        className={`font-data text-[11px] transition-colors ${
          isFocused ? "text-mineral font-medium" : "text-fog group-hover:text-neon-green"
        }`}
      >
        {run.issue_identifier}
      </span>
      <span className="font-data text-[10px] text-dim">
        {run.current_step_key
          ? (stepLabel[run.current_step_key] ?? run.current_step_key)
          : run.state.replace(/_/g, " ")}
      </span>
      <span className="font-data text-[10px] text-dim">{fmtElapsed(run.started_at, refTime)}</span>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onUnwatch();
        }}
        className="ml-0.5 font-data text-[10px] text-dim hover:text-oxide"
        title="Unwatch"
      >
        &times;
      </Button>
    </span>
  );
}
