import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { router } from "./routes.js";
import { createWsServer } from "./ws.js";
/**
 * Create and start the Express backend: CORS + REST API (mounted at /api) and
 * a WebSocket server (at /ws) on the same HTTP server.
 */
export async function createBackendServer(options = {}) {
    const port = options.port ?? 4000;
    const app = express();
    // CORS — allow cross-origin requests (set CORS_ORIGIN to restrict origins).
    app.use(cors({
        origin: process.env.CORS_ORIGIN ?? "*",
    }));
    app.use(express.json());
    app.use("/api", router);
    const server = createServer(app);
    createWsServer(server);
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, () => {
            server.off("error", reject);
            resolve();
        });
    });
    console.log(`[backend] REST API  → http://localhost:${port}/api`);
    console.log(`[backend] WebSocket → ws://localhost:${port}/ws`);
    return server;
}
