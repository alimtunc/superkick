import { useEffect, useRef, useState } from "react";
import type { RunEvent, EventLevel } from "../types";
import { subscribeToRunEvents } from "../api";

const levelColor: Record<EventLevel, string> = {
  debug: "text-gray-500",
  info: "text-slate-300",
  warn: "text-yellow-400",
  error: "text-red-400",
};

export function EventStream({ runId, active }: { runId: string; active: boolean }) {
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [done, setDone] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;

    setEvents([]);
    setConnected(true);
    setDone(false);

    const unsub = subscribeToRunEvents(
      runId,
      (ev) => setEvents((prev) => [...prev, ev]),
      () => {
        setConnected(false);
        setDone(true);
      },
      () => setConnected(false),
    );

    return unsub;
  }, [runId, active]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  if (!active && events.length === 0) {
    return (
      <p className="text-gray-500 text-sm">
        Click &quot;Watch Live&quot; to stream events.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 text-xs">
        {connected && (
          <span className="flex items-center gap-1 text-green-400">
            <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Live
          </span>
        )}
        {done && <span className="text-gray-500">Stream ended</span>}
        <span className="text-gray-600">{events.length} events</span>
      </div>
      <div className="max-h-96 overflow-y-auto rounded bg-slate-900 p-3 font-mono text-xs space-y-0.5">
        {events.map((ev) => (
          <div key={ev.id} className="flex gap-2">
            <span className="text-gray-600 shrink-0">
              {new Date(ev.ts).toLocaleTimeString()}
            </span>
            <span className={`shrink-0 w-14 ${levelColor[ev.level]}`}>{ev.level}</span>
            <span className="text-slate-500 shrink-0 w-28">{ev.kind}</span>
            <span className="text-slate-300 break-all">{ev.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
