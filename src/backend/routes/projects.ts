import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { readJson, writeJson } from "../workspace.js";

export const projectsRouter = Router();

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

interface ProjectsFile {
  projects: Project[];
}

const FILE = "projects.json";
const EMPTY: ProjectsFile = { projects: [] };

async function loadProjects(): Promise<Project[]> {
  const data = await readJson<ProjectsFile>(FILE, EMPTY);
  return data.projects ?? [];
}

async function saveProjects(projects: Project[]): Promise<void> {
  await writeJson(FILE, { projects });
}

projectsRouter.get("/projects", async (_req: Request, res: Response) => {
  const projects = await loadProjects();
  projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  res.json({ projects });
});

projectsRouter.post("/projects", async (req: Request, res: Response) => {
  const { name, description } = req.body ?? {};
  const now = new Date().toISOString();
  const project: Project = {
    id: randomUUID(),
    name: typeof name === "string" && name.trim() ? name.trim() : "Untitled",
    description: typeof description === "string" ? description : "",
    createdAt: now,
    updatedAt: now,
  };
  const projects = await loadProjects();
  projects.push(project);
  await saveProjects(projects);
  res.status(201).json({ project });
});

projectsRouter.get("/projects/:id", async (req: Request, res: Response) => {
  const projects = await loadProjects();
  const project = projects.find((p) => p.id === req.params.id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json({ project });
});

projectsRouter.put("/projects/:id", async (req: Request, res: Response) => {
  const projects = await loadProjects();
  const project = projects.find((p) => p.id === req.params.id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const { name, description } = req.body ?? {};
  if (typeof name === "string" && name.trim()) project.name = name.trim();
  if (typeof description === "string") project.description = description;
  project.updatedAt = new Date().toISOString();
  await saveProjects(projects);
  res.json({ project });
});

projectsRouter.delete("/projects/:id", async (req: Request, res: Response) => {
  const projects = await loadProjects();
  const next = projects.filter((p) => p.id !== req.params.id);
  if (next.length === projects.length) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  await saveProjects(next);
  res.status(204).end();
});
