import { createContext, use } from "react";
import type { WatchedSessionsAPI } from "../hooks/useWatchedSessions";

const WatchedSessionsContext = createContext<WatchedSessionsAPI | null>(null);

export const WatchedSessionsProvider = WatchedSessionsContext.Provider;

export function useWatchedSessionsCtx(): WatchedSessionsAPI {
  const ctx = use(WatchedSessionsContext);
  if (!ctx) throw new Error("useWatchedSessionsCtx must be used within WatchedSessionsProvider");
  return ctx;
}
