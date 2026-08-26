#!/usr/bin/env node
import { Command } from "commander";
import { fileURLToPath } from "node:url";
import path from "node:path";
import chalk from "chalk";
import open from "open";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createBackendServer } from "./backend/index.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// The Vite app source lives at the package root, next to dist/ (shipped in
// "files"), so this resolves correctly from both src/ (tsx) and dist/ (build).
const FRONTEND_ROOT = path.resolve(__dirname, "..", "frontend");
const program = new Command();
program
    .name("effectnode-media")
    .description("Start the effectnode-media services — a Vite + React + TypeScript frontend " +
    "and an Express backend (REST + WebSocket) — then open the browser.")
    .version("0.1.0")
    .option("--host <host>", "Host to bind", "0.0.0.0")
    .option("--frontend-port <port>", "Frontend (Vite) port", "5177")
    .option("--backend-port <port>", "Backend (Express) port", "4000")
    .option("--no-open", "Do not open the browser")
    .action(async (options) => {
    const host = options.host;
    const frontendPort = Number(options.frontendPort);
    const backendPort = Number(options.backendPort);
    // 1. Backend service — Express (REST + WebSocket) on :backendPort.
    const backend = await createBackendServer({ port: backendPort });
    // 2. Frontend service — Vite dev server on :frontendPort, proxying
    //    /api and /ws to the backend so browser calls are same-origin.
    const vite = await createViteServer({
        root: FRONTEND_ROOT,
        plugins: [react(), tailwindcss()],
        env: {
            PORT: backendPort,
        },
        server: {
            allowedHosts: true,
            host,
            port: frontendPort,
            strictPort: true,
            proxy: {
                "/api": {
                    target: `http://localhost:${backendPort}`,
                    changeOrigin: true,
                },
                "/ws": {
                    target: `ws://localhost:${backendPort}`,
                    ws: true,
                },
                "/p8881": {
                    target: `http://localhost:${backendPort}`,
                    changeOrigin: true,
                },
            },
        },
    });
    await vite.listen();
    const url = `http://${host}:${frontendPort}`;
    console.log("");
    console.log(chalk.green("effectnode-media is running:"));
    console.log(chalk.cyan(`  Frontend  → ${url}`));
    console.log(chalk.cyan(`  REST API  → http://localhost:${backendPort}/api`));
    console.log(chalk.cyan(`  WebSocket → ws://localhost:${backendPort}/ws`));
    console.log(chalk.dim("  Press Ctrl+C to stop."));
    console.log("");
    // 3. Open the frontend in the browser (skip when disabled or headless).
    if (options.open !== false &&
        process.env.EFFECTNODE_MEDIA_NO_OPEN !== "1") {
        await open(url);
    }
    const shutdown = () => {
        void vite.close();
        backend.close();
        process.exit(0);
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
});
program.parseAsync().catch((err) => {
    console.error(chalk.red(`\n✖ Failed to start effectnode-media: ${err.message}`));
    process.exit(1);
});
