import { Router } from "express";
import { healthRouter } from "./health.js";
import { mediaRouter } from "./media.js";
import { projectsRouter } from "./projects.js";
import { voiceRouter } from "./voice.js";

// Combined REST API router, mounted at /api.
export const router = Router();

router.use(healthRouter);
router.use(mediaRouter);
router.use(projectsRouter);
router.use(voiceRouter);
