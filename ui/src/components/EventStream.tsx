import { useEffect, useReducer, useRef } from "react";
import { subscribeToRunEvents } from "../api";
import type { EventLevel, RunEvent } from "../types";

const levelColor: Record<EventLevel, string> = {
  debug: "text-gray-500",
  info: "text-slate-300",
  warn: "text-yellow-400",
  error: "text-red-400",
};

interface EventStreamProps {
  runId: string;
  active: boolean;
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

export function EventStream({ runId, active }: EventStreamProps) {
  return active ? (
    <ActiveEventStream key={runId} runId={runId} />
  ) : (
    <p className="text-sm text-gray-500">Click &quot;Watch Live&quot; to stream events.</p>
  );
}

function ActiveEventStream({ runId }: { runId: string }) {
  const [state, dispatch] = useReducer(eventStreamReducer, initialState);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return subscribeToRunEvents(
      runId,
      (event) => {
        dispatch({ type: "event_received", event });
      },
      () => {
        dispatch({ type: "stream_done" });
      },
      () => {
        dispatch({ type: "stream_error" });
      },
    );
  }, [runId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.events.length]);

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs">
        {state.connected ? (
          <span className="flex items-center gap-1 text-green-400">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-400" />
            Live
          </span>
        ) : null}
        {state.done ? <span className="text-gray-500">Stream ended</span> : null}
        <span className="text-gray-600">{state.events.length} events</span>
      </div>
      <div className="max-h-96 space-y-0.5 overflow-y-auto rounded bg-slate-900 p-3 font-mono text-xs">
        {state.events.map((event) => (
          <div key={event.id} className="flex gap-2">
            <span className="shrink-0 text-gray-600">
              {new Date(event.ts).toLocaleTimeString()}
            </span>
            <span className={`w-14 shrink-0 ${levelColor[event.level]}`}>{event.level}</span>
            <span className="w-28 shrink-0 text-slate-500">{event.kind}</span>
            <span className="break-all text-slate-300">{event.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
