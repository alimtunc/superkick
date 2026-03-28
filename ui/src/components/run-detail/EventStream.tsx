import { useEffect, useRef } from "react";
import type { EventLevel } from "@/types";

interface EventStreamProps {
  runId: string;
  active: boolean;
  onStateChange?: () => void;
}
import { useEventStream } from "@/hooks/useEventStream";

const levelColor: Record<EventLevel, string> = {
  debug: "text-dim",
  info: "text-silver",
  warn: "text-gold",
  error: "text-oxide",
};

export function EventStream({ runId, active, onStateChange }: EventStreamProps) {
  return active ? (
    <ActiveEventStream key={runId} runId={runId} onStateChange={onStateChange} />
  ) : (
    <p className="text-sm font-data text-dim">Click &quot;LIVE&quot; to stream events.</p>
  );
}

function ActiveEventStream({
  runId,
  onStateChange,
}: {
  runId: string;
  onStateChange?: () => void;
}) {
  const { events, connected, done } = useEventStream(runId, onStateChange);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  return (
    <div>
      <div className="mb-2 flex items-center gap-3 text-[11px]">
        {connected ? (
          <span className="flex items-center gap-1.5 text-neon-green font-data">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-neon-green live-pulse" />
            LIVE
          </span>
        ) : null}
        {done ? <span className="text-dim font-data">Stream ended</span> : null}
        <span className="text-dim font-data">{events.length} events</span>
      </div>
      <div className="max-h-96 space-y-px overflow-y-auto rounded border border-edge bg-carbon p-2 font-data text-[11px]">
        {events.map((event) => (
          <div key={event.id} className="flex gap-2 py-0.5">
            <span className="shrink-0 text-dim">{new Date(event.ts).toLocaleTimeString()}</span>
            <span className={`w-12 shrink-0 ${levelColor[event.level]}`}>{event.level}</span>
            <span className="w-28 shrink-0 text-ash">{event.kind}</span>
            <span className="break-all text-fog">{event.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
