import { BrowserRouter, Routes, Route } from "react-router-dom";
import { RunList } from "./pages/RunList";
import { RunDetailRoute } from "./pages/RunDetail";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RunList />} />
        <Route path="/runs/:id" element={<RunDetailRoute />} />
      </Routes>
    </BrowserRouter>
  );
}
