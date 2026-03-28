import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { RunStateBadge } from "@/components/RunStateBadge";
import type { Run } from "@/types";

interface RunDetailHeaderProps {
  run: Run;
  isTerminal: boolean;
  streaming: boolean;
  onToggleStream: () => void;
  onRefresh: () => void;
  watched: boolean;
  maxReached: boolean;
  onToggleWatch: () => void;
  cancelConfirm: boolean;
  onCancelRequest: () => void;
  onCancelConfirm: () => void;
  onCancelDismiss: () => void;
  cancelling: boolean;
}

function pinButtonClass(watched: boolean, maxReached: boolean): string {
  if (watched) return "border-mineral/30 bg-mineral-dim text-mineral hover:bg-mineral/20";
  if (maxReached) return "border-edge text-dim/30 cursor-not-allowed";
  return "";
}

function pinButtonTitle(watched: boolean, maxReached: boolean): string {
  if (watched) return "Remove from watch rail";
  if (maxReached) return "Max 5 watched";
  return "Pin to watch rail";
}

export function RunDetailHeader({
  run,
  isTerminal,
  streaming,
  onToggleStream,
  onRefresh,
  watched,
  maxReached,
  onToggleWatch,
  cancelConfirm,
  onCancelRequest,
  onCancelConfirm,
  onCancelDismiss,
  cancelling,
}: RunDetailHeaderProps) {
  return (
    <header className="border-b border-edge bg-carbon/90 backdrop-blur-md sticky top-0 z-50">
      <div className="mx-auto max-w-4xl px-5 h-12 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="font-data text-[11px] text-dim hover:text-silver transition-colors"
          >
            &larr; CONTROL CENTER
          </Link>
          <span className="text-edge">|</span>
          <span className="font-data text-[11px] text-fog font-medium">{run.issue_identifier}</span>
          <RunStateBadge state={run.state} />
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="xs"
            onClick={onToggleWatch}
            disabled={!watched && maxReached}
            className={`font-data text-[11px] ${pinButtonClass(watched, maxReached)}`}
            title={pinButtonTitle(watched, maxReached)}
          >
            {watched ? "\u25C9 PINNED" : "\u25CB PIN"}
          </Button>

          {!isTerminal ? (
            <Button
              variant="outline"
              size="xs"
              onClick={onToggleStream}
              className={`font-data text-[11px] ${
                streaming
                  ? "border-neon-green/30 bg-mineral-dim text-neon-green hover:bg-mineral/20"
                  : ""
              }`}
            >
              {streaming ? (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-neon-green live-pulse" />
                  LIVE
                </span>
              ) : (
                "LIVE"
              )}
            </Button>
          ) : null}

          <Button
            variant="outline"
            size="xs"
            onClick={onRefresh}
            className="font-data text-[11px] text-dim hover:text-silver"
          >
            REFRESH
          </Button>

          {!isTerminal ? (
            <>
              <span className="w-px h-5 bg-edge mx-1" />
              {cancelConfirm ? (
                <div className="flex items-center gap-1">
                  <span className="font-data text-[10px] text-oxide">Cancel this run?</span>
                  <Button
                    variant="destructive"
                    size="xs"
                    onClick={onCancelConfirm}
                    disabled={cancelling}
                    className="font-data text-[11px]"
                  >
                    {cancelling ? "..." : "CONFIRM"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={onCancelDismiss}
                    className="font-data text-[11px] text-dim hover:text-silver"
                  >
                    &times;
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={onCancelRequest}
                  className="font-data text-[11px] text-dim hover:text-oxide hover:border-oxide/30"
                >
                  CANCEL RUN
                </Button>
              )}
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
