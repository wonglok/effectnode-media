import { Routes, Route } from "react-router-dom";
import SetupPage from "./SetupPage";
import MediaStudio from "./MediaStudio";
import ProjectEditorPage from "./components/ProjectEditorPage";

export default function AppRouter({ port = 4000 }) {
  return (
    <Routes>
      <Route path="/" element={<SetupPage port={port} />} />
      <Route path="/app" element={<MediaStudio />} />
      <Route path="/projects/:projectID" element={<ProjectEditorPage />} />
      <Route path="/projects/:projectID/:tab" element={<ProjectEditorPage />} />
    </Routes>
  );
}
