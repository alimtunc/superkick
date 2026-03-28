import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ControlCenter } from "./pages/ControlCenter";
import { RunDetailRoute } from "./pages/RunDetail";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ControlCenter />} />
        <Route path="/runs/:id" element={<RunDetailRoute />} />
      </Routes>
    </BrowserRouter>
  );
}
