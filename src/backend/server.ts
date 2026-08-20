import { createBackendServer } from "./index.js";

// Standalone backend entry for `bun run dev`. The frontend (Vite) runs as a
// separate process (see vite.config.ts), so nodemon can restart this on
// backend edits without disturbing the browser's HMR connection.

const port = Number(process.env.BACKEND_PORT ?? 4000);

async function main(): Promise<void> {
  //

  const server = await createBackendServer({ port });

  const shutdown = () => {
    try {
      server.close(() => process.exit(0));
    } catch (e) {
      console.error(e);
    }
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((err: unknown) => {
  console.error(`[backend] failed to start: ${(err as Error).message}`);
  process.exit(1);
});
