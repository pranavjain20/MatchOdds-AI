import { Navigate, Route, Routes } from "react-router-dom";
import { IS_DEMO } from "./demo/config";
import Layout from "./components/Layout";
import MatchupPage from "./pages/MatchupPage";
import ResearchPage from "./pages/ResearchPage";
import SimulationPage from "./pages/SimulationPage";
import PipelinesPage from "./pages/PipelinesPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<MatchupPage />} />
        <Route path="/research" element={<ResearchPage />} />
        {/* The demo has no historical odds to simulate on and can't run pipelines */}
        <Route path="/simulation" element={IS_DEMO ? <Navigate to="/" replace /> : <SimulationPage />} />
        <Route path="/data" element={IS_DEMO ? <Navigate to="/" replace /> : <PipelinesPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

function NotFound() {
  return (
    <div className="panel mx-auto max-w-md p-10 text-center">
      <h2 className="font-display text-2xl font-bold">Page not found</h2>
      <p className="mt-2 text-sm text-slate-400">Try the matchup view or research dashboard.</p>
    </div>
  );
}
