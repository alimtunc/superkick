import { useEffect, useReducer, useRef } from "react";
import { subscribeToRunEvents } from "../api";
import type { EventLevel, RunEvent } from "../types";

const levelColor: Record<EventLevel, string> = {
  debug: "text-dim",
  info: "text-silver",
  warn: "text-gold",
  error: "text-oxide",
};

interface EventStreamProps {
  runId: string;
  active: boolean;
  onStateChange?: () => void;
}

interface EventStreamState {
  events: RunEvent[];
  connected: boolean;
  done: boolean;
}

type EventStreamAction =
  | { type: "event_received"; event: RunEvent }
  | { type: "stream_done" }
  | { type: "stream_error" };

const initialState: EventStreamState = {
  events: [],
  connected: true,
  done: false,
};

function eventStreamReducer(
  state: EventStreamState,
  action: EventStreamAction,
): EventStreamState {
  switch (action.type) {
    case "event_received":
      return { ...state, events: [...state.events, action.event] };
    case "stream_done":
      return { ...state, connected: false, done: true };
    case "stream_error":
      return { ...state, connected: false };
    default:
      return state;
  }
}

export function EventStream({ runId, active, onStateChange }: EventStreamProps) {
  return active ? (
    <ActiveEventStream key={runId} runId={runId} onStateChange={onStateChange} />
  ) : (
    <p className="text-sm font-data text-dim">Click &quot;Watch Live&quot; to stream events.</p>
  );
}

function ActiveEventStream({ runId, onStateChange }: { runId: string; onStateChange?: () => void }) {
  const [state, dispatch] = useReducer(eventStreamReducer, initialState);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return subscribeToRunEvents(
      runId,
      (event) => {
        dispatch({ type: "event_received", event });
        if (event.kind === "state_change" || event.kind === "interrupt_created") {
          onStateChange?.();
        }
      },
      () => dispatch({ type: "stream_done" }),
      () => dispatch({ type: "stream_error" }),
    );
  }, [runId, onStateChange]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.events.length]);

  return (
    <div>
      <div className="mb-2 flex items-center gap-3 text-[11px]">
        {state.connected ? (
          <span className="flex items-center gap-1.5 text-neon-green font-data">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-neon-green live-pulse" />
            LIVE
          </span>
        ) : null}
        {state.done ? <span className="text-dim font-data">Stream ended</span> : null}
        <span className="text-dim font-data">{state.events.length} events</span>
      </div>
      <div className="max-h-96 space-y-px overflow-y-auto rounded border border-edge bg-carbon p-2 font-data text-[11px]">
        {state.events.map((event) => (
          <div key={event.id} className="flex gap-2 py-0.5">
            <span className="shrink-0 text-dim">
              {new Date(event.ts).toLocaleTimeString()}
            </span>
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
