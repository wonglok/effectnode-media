import { Routes, Route } from "react-router-dom";
import SetupPage from "./SetupPage";
import MediaStudio from "./MediaStudio";
import ProjectEditorPage from "./components/ProjectEditorPage";

export default function AppRouter({ port = 4000 }) {
  return (
    <Routes>
      <Route path="/" element={<SetupPage port={port} />} />
      <Route path="/app" element={<MediaStudio />} />
      <Route path="/project/:id" element={<ProjectEditorPage />} />
      <Route path="/project/:id/:tab" element={<ProjectEditorPage />} />
    </Routes>
  );
}
