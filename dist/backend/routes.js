import { Router } from "express";
export const router = Router();
const media = [
    { id: 1, title: "Sintel", type: "film" },
    { id: 2, title: "Big Buck Bunny", type: "animation" },
    { id: 3, title: "Tears of Steel", type: "short" },
];
router.get("/health", (_req, res) => {
    res.json({
        ok: true,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    });
});
router.get("/media", (_req, res) => {
    res.json({ media });
});
router.post("/media", (req, res) => {
    res.status(201).json({ ok: true, received: req.body ?? {} });
});
