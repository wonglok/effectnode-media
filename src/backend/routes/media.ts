import { Router, type Request, type Response } from "express";

export const mediaRouter = Router();

interface MediaItem {
  id: number;
  title: string;
  type: string;
}

const media: MediaItem[] = [
  { id: 1, title: "Sintel", type: "film" },
  { id: 2, title: "Big Buck Bunny", type: "animation" },
  { id: 3, title: "Tears of Steel", type: "short" },
];

mediaRouter.get("/media", (_req: Request, res: Response) => {
  res.json({ media });
});

mediaRouter.post("/media", (req: Request, res: Response) => {
  res.status(201).json({ ok: true, received: req.body ?? {} });
});
