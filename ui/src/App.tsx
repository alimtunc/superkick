import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useDashboardRuns } from "./hooks/useDashboardRuns";
import { useWatchedSessions } from "./hooks/useWatchedSessions";
import { WatchedSessionsProvider } from "./context/WatchedSessionsContext";
import { ControlCenter } from "./pages/ControlCenter";
import { RunDetailRoute } from "./pages/RunDetail";

function AppRoutes() {
  const d = useDashboardRuns();
  const watched = useWatchedSessions(d.runs);

  return (
    <WatchedSessionsProvider value={watched}>
      <Routes>
        <Route path="/" element={<ControlCenter dashboard={d} />} />
        <Route path="/runs/:id" element={<RunDetailRoute refTime={d.refTime} />} />
      </Routes>
    </WatchedSessionsProvider>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
