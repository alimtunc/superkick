import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import type { Run } from "@/types";

interface TopBarProps {
  lastRefresh: Date;
  needsAttention: Run[];
  loading: boolean;
  onRefresh: () => void;
}

export function TopBar({ lastRefresh, needsAttention, loading, onRefresh }: TopBarProps) {
  return (
    <header className="border-b border-edge bg-carbon/90 backdrop-blur-md sticky top-0 z-50">
      <div className="mx-auto max-w-360 px-5 h-12 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-neon-green live-pulse" />
            <span className="font-data text-[11px] text-silver tracking-wider uppercase">
              Superkick
            </span>
          </div>
          <span className="text-dim">/</span>
          <span className="text-sm font-medium text-fog">Control Center</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-data text-[11px] text-dim">
            {lastRefresh.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
          {needsAttention.length > 0 && (
            <Link
              to="/runs/$runId"
              params={{ runId: needsAttention[0].id }}
              className="font-data text-[11px] text-oxide hover:text-oxide/80 transition-colors"
            >
              {needsAttention.length} alert{needsAttention.length > 1 ? "s" : ""}
            </Link>
          )}
          <Button
            variant="outline"
            size="xs"
            onClick={onRefresh}
            disabled={loading}
            className="font-data text-[11px] text-silver hover:text-fog"
          >
            {loading ? "..." : "REFRESH"}
          </Button>
        </div>
      </div>
    </header>
  );
}
