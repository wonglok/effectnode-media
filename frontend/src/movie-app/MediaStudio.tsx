import Aurora from "./components/Aurora";
import ProjectManager from "./components/ProjectManager";

export default function MediaStudio() {
  return (
    <div className="relative min-h-screen">
      <Aurora />
      <div className="relative z-10 mx-auto w-full max-w-4xl px-6 py-12 md:py-16">
        <ProjectManager />
      </div>
    </div>
  );
}
