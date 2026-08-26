import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  // unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createNetServer } from "node:net";
import { Readable } from "node:stream";
import { spawn, type Subprocess } from "./process.js";

const __filename = fileURLToPath(import.meta.url);

import { homedir } from "node:os";
import express from "express";
import cors from "cors";
import { renderMediaRoutes } from "./render-media.js";
import { agentBackend } from "./agent/agent-backend.js";
import { generationQueueSetup } from "./generation-queue.js";
import { createServer } from "node:http";
// import { readdir } from "node:fs/promises";
// import { rename } from "node:fs/promises";
// import { execSync } from "node:child_process";

// const DEV_SERVER_PORT = 5173;
// const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

// // Check if Vite dev server is running for HMR
// async function getMainViewUrl(): Promise<string> {
//   const channel = await Updater.localInfo.channel();
//   if (channel === "dev") {
//     try {
//       await fetch(DEV_SERVER_URL, { method: "HEAD" });
//       console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
//       return DEV_SERVER_URL;
//     } catch {
//       console.log(
//         "Vite dev server not running. Run 'bun run dev:hmr' for HMR support.",
//       );
//     }
//   }
//   return "views://mainview/index.html";
// }

// App configuration
// const APP_NAME = "Media Studio by loklok";
const APP_DATA_DIR = join(homedir(), "media-studio");
const PYTHON_DIR = join(APP_DATA_DIR, "python-src");
const PROJECTS_DIR = join(APP_DATA_DIR, "projects");
const JSON_DIR = join(APP_DATA_DIR, "json");
const BACKEND_PORT_START = 4000;
// Local OpenAI-compatible model server (mlx-vlm) that /p8881 proxies to.
const AI_API_PORT = 8881;
let BACKEND_PORT = BACKEND_PORT_START;

//

// Setup state
interface SetupState {
  port: string;
  homebrewInstalled: boolean;
  ffmpegInstalled: boolean;
  uvInstalled: boolean;
  pythonInstalled: boolean;
  depsInstalled: boolean;
  backendRunning: boolean;
  imageTestRendered: boolean;
  imageEditTestRendered: boolean;
  videoTestRendered: boolean;
  qwenImageTestRendered: boolean;
  allOK: boolean;
  error?: string;
}

let setupState: SetupState = {
  imageEditTestRendered: false,
  qwenImageTestRendered: false,
  port: "",
  homebrewInstalled: false,
  ffmpegInstalled: false,
  uvInstalled: false,
  pythonInstalled: false,
  depsInstalled: false,
  backendRunning: false,
  imageTestRendered: false,
  videoTestRendered: false,
  allOK: false,
  error: "",
};

export async function runSetup({
  port = 4000,
}: {
  port: number;
}): Promise<any> {
  [APP_DATA_DIR, PYTHON_DIR, PROJECTS_DIR, JSON_DIR].forEach((dir) => {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  });

  BACKEND_PORT = await findFreePort(port);

  console.log("BACKEND_PORT", BACKEND_PORT);

  const app = express();
  app.use(cors());
  // Proxy /p8881/* → http://localhost:8881/* so the local AI API (mlx-vlm,
  // OpenAI-compatible) is reachable from other devices on the network. Mounted
  // before the JSON body parser so the raw request body is streamed through
  // unchanged (chat completions / SSE streaming).
  app.use("/p8881", async (req, res) => {
    const upstreamPath = req.originalUrl.slice("/p8881".length) || "/";
    try {
      const headers: Record<string, string> = {};
      for (const name of ["content-type", "authorization", "accept"]) {
        const value = req.headers[name];
        if (typeof value === "string") headers[name] = value;
      }

      const upstream = await fetch(
        `http://localhost:${AI_API_PORT}${upstreamPath}`,
        {
          method: req.method,
          headers,
          body:
            req.method === "GET" || req.method === "HEAD"
              ? undefined
              : (Readable.toWeb(req) as any),
          duplex: "half",
        } as any,
      );

      res.status(upstream.status);
      const contentType = upstream.headers.get("content-type");
      if (contentType) res.setHeader("content-type", contentType);

      if (upstream.body) {
        Readable.fromWeb(upstream.body as any).pipe(res);
      } else {
        res.end();
      }
    } catch (e) {
      if (!res.headersSent) {
        res.status(502).json({ error: `AI proxy error: ${String(e)}` });
      } else {
        res.end();
      }
    }
  });
  app.use(express.json({ limit: "100gb" }));
  app.get("/api/hi", (req, res) => {
    res.json({ hi: "hi" });
  });

  // app.get("/lambobo.png", (req, res) => {
  //   const imagePath = join(
  //     __filename,
  //     "..",
  //     "..",
  //     "python-src",
  //     "images",
  //     "lambobo.png",
  //   );
  //   res.sendFile(imagePath);
  // });

  // Serve ffmpeg.wasm core files for client-side video stitching. These live
  // in src/mainview/public/ffmpeg (copied to dist/ffmpeg by Vite, then into
  // views/mainview/ffmpeg in the packaged build). Search a few candidate roots
  // so the route works in both dev and packaged layouts.
  const FFMPEG_CORE_FILES = ["ffmpeg-core.js", "ffmpeg-core.wasm"] as const;
  app.get("/ffmpeg/:file", (req, res) => {
    const file = req.params.file as string;
    if (
      !FFMPEG_CORE_FILES.includes(file as (typeof FFMPEG_CORE_FILES)[number])
    ) {
      return res.status(404).end();
    }

    const base = dirname(__filename);
    const candidates = [
      join(base, "..", "mainview", "public", "ffmpeg", file),
      join(base, "..", "..", "mainview", "public", "ffmpeg", file),
      join(base, "..", "..", "dist", "ffmpeg", file),
      join(base, "..", "..", "views", "mainview", "ffmpeg", file),
    ];

    const found = candidates.find((p) => existsSync(p));
    if (!found) return res.status(404).end();

    if (file.endsWith(".wasm")) {
      res.setHeader("Content-Type", "application/wasm");
    } else {
      res.setHeader("Content-Type", "text/javascript");
    }
    res.sendFile(found);
  });

  app.get("/api/setup", async (req, res) => {
    // Set SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Helper to run a step and send progress
    const runStep = async (
      step: string,
      label: string,
      fn: () => Promise<boolean>,
    ): Promise<boolean> => {
      send("progress", { step, status: "running", label });
      try {
        const ok = await fn();
        if (ok) {
          send("progress", { step, status: "completed", label });
        } else {
          send("progress", { step, status: "error", label });
        }
        return ok;
      } catch (e) {
        send("progress", {
          step,
          status: "error",
          label,
          error: String(e),
        });
        return false;
      }
    };

    // Reset state
    setupState = {
      port: `${BACKEND_PORT}`,
      homebrewInstalled: false,
      ffmpegInstalled: false,
      uvInstalled: false,
      pythonInstalled: false,
      depsInstalled: false,
      backendRunning: false,
      imageTestRendered: false,
      imageEditTestRendered: false,
      videoTestRendered: false,
      qwenImageTestRendered: false,
      error: "",
      allOK: false,
    };

    send("progress", {
      step: "init",
      status: "running",
      label: "Running setup...",
    });

    // Step 0a: Check/install Homebrew
    setupState.homebrewInstalled = await checkHomebrewInstalled();
    if (!setupState.homebrewInstalled) {
      setupState.homebrewInstalled = await runStep(
        "homebrew",
        "Installing Homebrew package manager...",
        installHomebrew,
      );
      if (!setupState.homebrewInstalled) {
        setupState.error = "Failed to install Homebrew";
        send("error", { error: setupState.error });
        res.end();
        return;
      }
    } else {
      send("progress", {
        step: "homebrew",
        status: "completed",
        label: "Homebrew package manager found",
      });
    }

    // Step 0b: Check/install ffmpeg
    setupState.ffmpegInstalled = await checkFfmpegInstalled();
    if (!setupState.ffmpegInstalled) {
      setupState.ffmpegInstalled = await runStep(
        "ffmpeg",
        "Installing ffmpeg via Homebrew...",
        installFfmpeg,
      );
      if (!setupState.ffmpegInstalled) {
        // Non-fatal: ffmpeg is useful but the app may still function
        console.warn("Failed to install ffmpeg, continuing...");
      }
    } else {
      send("progress", {
        step: "ffmpeg",
        status: "completed",
        label: "ffmpeg found",
      });
    }

    // Step 1: Check/install uv
    setupState.uvInstalled = await checkUvInstalled();
    if (!setupState.uvInstalled) {
      setupState.uvInstalled = await runStep(
        "uv",
        "Installing uv package manager...",
        installUv,
      );
      if (!setupState.uvInstalled) {
        setupState.error = "Failed to install uv package manager";
        send("error", { error: setupState.error });
        res.end();
        return;
      }
    } else {
      send("progress", {
        step: "uv",
        status: "completed",
        label: "uv package manager found",
      });
    }

    // Step 2: Setup Python environment
    setupState.pythonInstalled = await runStep(
      "python",
      "Setting up Python environment...",
      setupPythonEnvironment,
    );
    if (!setupState.pythonInstalled) {
      setupState.error = "Failed to setup Python environment";
      send("error", { error: setupState.error });
      res.end();
      return;
    }

    // Step 3: Install Python dependencies
    setupState.depsInstalled = await runStep(
      "deps",
      "Installing Python dependencies...",
      installPythonDependencies,
    );

    if (!setupState.depsInstalled) {
      setupState.error = "Failed to install Python dependencies";
      send("error", { error: setupState.error });
      res.end();
      return;
    }

    // Step 4: Test render video
    // setupState.videoTestRendered = await runStep(
    //   "render-video",
    //   "Rendering test video...",
    //   async () => testRenderVideo({ send }),
    // );
    // if (!setupState.videoTestRendered) {
    //   // Non-fatal: still mark setup as complete
    //   console.warn("Test video render failed, continuing...");
    // }

    // // Step 7: Test qwen image generation
    // setupState.qwenImageTestRendered = await runStep(
    //   "qwen-image",
    //   "Processing qwen image generation task...",
    //   async () => testQwenImageGeneration({ send }),
    // );
    // if (!setupState.qwenImageTestRendered) {
    //   console.warn("Test qwen image generation failed, continuing...");
    // }

    // // Step 6: Test edit image
    // setupState.imageEditTestRendered = await runStep(
    //   "edit-image",
    //   "Processing image editing task...",
    //   async () => testQwenImageEditGeneration({ send }),
    // );
    // if (!setupState.imageEditTestRendered) {
    //   // Non-fatal: still mark setup as complete
    //   console.warn("Test image edit failed, continuing...");
    // }

    setupState.allOK = true;
    send("complete", { success: true, port: BACKEND_PORT });
    res.end();
  });

  renderMediaRoutes({ app, getUvPath });
  //
  //
  agentBackend({ app, getUvPath, backendPort: BACKEND_PORT });
  //
  generationQueueSetup({ app, getUvPath });
  //

  app.listen(BACKEND_PORT);

  // const port = options.port ?? 4000;

  // const app = express();

  // // CORS — allow cross-origin requests (set CORS_ORIGIN to restrict origins).
  // app.use(
  //   cors({
  //     origin: process.env.CORS_ORIGIN ?? "*",
  //   }),
  // );
  // // A large JSON limit so the voice-clone endpoint can accept base64 reference
  // // audio (a 24-bit PCM mono WAV is several MB before base64 encoding).
  // app.use(express.json({ limit: "100mb" }));

  // app.use("/api", router);

  const server = createServer(app);
  // createWsServer(server);

  // await new Promise<void>((resolve, reject) => {
  //   server.once("error", reject);
  //   server.listen(port, () => {
  //     server.off("error", reject);
  //     resolve();
  //   });
  // });

  // console.log(`[backend] REST API  → http://localhost:${port}/api`);
  // console.log(`[backend] WebSocket → ws://localhost:${port}/ws`);

  return server;
}

async function findFreePort(startPort: number): Promise<number> {
  for (let port = startPort; port < startPort + 100; port++) {
    if (await isPortFree(port)) {
      return port;
    }
  }
  throw new Error(`No free port found in range ${startPort}-${startPort + 99}`);
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createNetServer();
    server.once("error", () => resolve(false));
    // Bind the same wildcard address as `app.listen(port)` (Node defaults to
    // the IPv6 dual-stack wildcard), so the probe and the real listen agree on
    // which address family is in use.
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
  });
}

// ========== Utility Functions ==========

async function runCommand(
  command: string,
  args: string[],
  options?: { cwd?: string; env?: Record<string, string> },
): Promise<{ success: boolean; output: string; error: string }> {
  try {
    const proc = spawn([command, ...args], {
      cwd: options?.cwd,
      env: { ...process.env, ...options?.env } as any,
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const error = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    return {
      success: exitCode === 0,
      output: output.trim(),
      error: error.trim(),
    };
  } catch (e) {
    return {
      success: false,
      output: "",
      error: String(e),
    };
  }
}

async function checkCommand(command: string): Promise<boolean> {
  const result = await runCommand("which", [command]);
  return result.success;
}

// ========== Homebrew Functions ==========

async function checkHomebrewInstalled(): Promise<boolean> {
  // Check common Homebrew paths first (faster than spawning a process)
  const brewPaths = [
    "/opt/homebrew/bin/brew", // Apple Silicon
    "/usr/local/bin/brew", // Intel Mac
    join(homedir(), "homebrew", "bin", "brew"),
  ];

  for (const path of brewPaths) {
    if (existsSync(path)) {
      return true;
    }
  }

  // Fall back to which
  return await checkCommand("brew");
}

async function installHomebrew(): Promise<boolean> {
  console.log("Installing Homebrew...");

  const result = await runCommand("/bin/bash", [
    "-c",
    '"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
  ]);

  if (result.success) {
    console.log("Homebrew installed successfully");
    // After install, Homebrew may be at different paths depending on architecture
    // The user may need to add it to PATH, but we try common paths
    return true;
  } else {
    console.error("Failed to install Homebrew:", result.error);
    return false;
  }
}

// ========== ffmpeg Functions ==========

async function checkFfmpegInstalled(): Promise<boolean> {
  // Check common ffmpeg paths
  const ffmpegPaths = [
    "/opt/homebrew/bin/ffmpeg", // Apple Silicon Homebrew
    "/usr/local/bin/ffmpeg", // Intel Mac Homebrew
  ];

  for (const path of ffmpegPaths) {
    if (existsSync(path)) {
      const binDir = dirname(path);

      // Ensure the directory is on PATH for child processes
      if (!process.env.PATH?.includes(binDir)) {
        process.env.PATH = `${binDir}:${process.env.PATH}`;
      }

      // Persist to shell config files so it survives terminal restarts
      persistBinDirToShellRc(binDir);

      return true;
    }
  }

  // Fall back to which
  return await checkCommand("ffmpeg");
}

/**
 * Add a directory to the user's shell config files (~/.bashrc, ~/.zshrc)
 * if it isn't already there.
 */
function persistBinDirToShellRc(binDir: string): void {
  const home = homedir();
  const exportLine = `export PATH="${binDir}:$PATH"`;
  const rcFiles = [join(home, ".zshrc"), join(home, ".bashrc")];

  for (const rcPath of rcFiles) {
    try {
      if (!existsSync(rcPath)) continue;

      const content = readFileSync(rcPath, "utf-8");
      if (content.includes(binDir)) continue; // already configured

      // Append the export line
      appendFileSync(rcPath, `\n# Added by lambobo-studio\n${exportLine}\n`);
      console.log(`Added ${binDir} to PATH in ${rcPath}`);
    } catch (err) {
      // Non-fatal: the session PATH is already set above
      console.warn(`Could not update ${rcPath}:`, err);
    }
  }
}

async function installFfmpeg(): Promise<boolean> {
  console.log("Installing ffmpeg via Homebrew...");

  // Resolve brew path
  let brewPath = "brew";
  const brewCandidates = [
    "/opt/homebrew/bin/brew",
    "/usr/local/bin/brew",
    join(homedir(), "homebrew", "bin", "brew"),
  ];
  for (const candidate of brewCandidates) {
    if (existsSync(candidate)) {
      brewPath = candidate;
      break;
    }
  }

  const result = await runCommand(brewPath, ["install", "ffmpeg"]);

  if (result.success) {
    console.log("ffmpeg installed successfully");
    return true;
  } else {
    console.error("Failed to install ffmpeg:", result.error);
    return false;
  }
}

// ========== Setup Functions ==========

async function checkUvInstalled(): Promise<boolean> {
  if (await checkCommand("uv")) {
    return true;
  }

  const uvPaths = [
    "/opt/homebrew/bin/uv", // Apple Silicon Homebrew
    join(homedir(), ".local", "bin", "uv"),
    join(homedir(), ".cargo", "bin", "uv"),
    "/usr/local/bin/uv",
  ];

  for (const path of uvPaths) {
    if (existsSync(path)) {
      const binDir = dirname(path);

      // Ensure the directory is on PATH for child processes
      if (!process.env.PATH?.includes(binDir)) {
        process.env.PATH = `${binDir}:${process.env.PATH}`;
      }

      // Persist to shell config files
      persistBinDirToShellRc(binDir);

      return true;
    }
  }

  return false;
}

async function installUv(): Promise<boolean> {
  console.log("Installing uv via Homebrew...");

  // Resolve brew path
  let brewPath = "brew";
  const brewCandidates = [
    "/opt/homebrew/bin/brew",
    "/usr/local/bin/brew",
    join(homedir(), "homebrew", "bin", "brew"),
  ];
  for (const candidate of brewCandidates) {
    if (existsSync(candidate)) {
      brewPath = candidate;
      break;
    }
  }

  const result = await runCommand(brewPath, ["install", "uv"]);

  if (result.success) {
    console.log("uv installed successfully via Homebrew");
    return true;
  } else {
    console.error("Failed to install uv:", result.error);
    return false;
  }
}

export async function getUvPath(): Promise<string> {
  // Fall back to which
  if (await checkCommand("uv")) {
    const result = await runCommand("which", ["uv"]);
    return result.output;
  }

  // Check known paths first — always return absolute path so child processes
  // don't need uv on PATH
  const uvPaths = [
    "/usr/local/bin/uv",
    "/opt/homebrew/bin/uv", // Apple Silicon Homebrew
    join(homedir(), ".local", "bin", "uv"),
    join(homedir(), ".cargo", "bin", "uv"),
  ];

  for (const path of uvPaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  throw new Error("uv not found");
}

async function setupPythonEnvironment(): Promise<boolean> {
  console.log("Setting up Python environment...");

  const uvPath = await getUvPath();
  const venvPath = join(PYTHON_DIR, ".venv");

  if (!existsSync(venvPath)) {
    console.log("Creating Python 3.10 virtual environment...");
    const result = await runCommand(uvPath, [
      "venv",
      "--python",
      "3.10",
      venvPath,
    ]);

    if (!result.success) {
      console.error("Failed to create venv:", result.error);
      return false;
    }
  }

  return true;
}

async function installPythonDependencies(): Promise<boolean> {
  console.log("Installing Python dependencies...");

  {
    const pythonAppSrcDir = join(APP_DATA_DIR, "python-src");
    if (!existsSync(pythonAppSrcDir)) {
      mkdirSync(pythonAppSrcDir, { recursive: true });
    }

    const ltxFolder = join(pythonAppSrcDir, "ltx-2-mlx");

    if (!existsSync(ltxFolder)) {
      let cloneCMD = await runCommand(
        "git",
        [`clone`, `https://github.com/dgrauet/ltx-2-mlx.git`, "ltx-2-mlx"],
        { cwd: pythonAppSrcDir },
      );

      console.log(cloneCMD.success, cloneCMD.output);
    }

    const uvPath = await getUvPath();

    const uvSyncResult = await runCommand(
      uvPath,
      [
        //
        "sync",
        "--all-extras",
      ],
      {
        cwd: ltxFolder,
      },
    );
    if (!uvSyncResult.success) {
      console.error("Failed to install ltx model:", uvSyncResult.error);
      return false;
    }
  }

  {
    const pythonAppSrcDir = join(APP_DATA_DIR, "python-src");
    if (!existsSync(pythonAppSrcDir)) {
      mkdirSync(pythonAppSrcDir, { recursive: true });
    }

    const dotsTtsFolder = join(pythonAppSrcDir, "dots-tts-mlx");

    if (!existsSync(dotsTtsFolder)) {
      const cloneCMD = await runCommand(
        "git",
        [
          "clone",
          "--depth",
          "1",
          "--branch",
          "v0.2.0",
          "https://github.com/sb1992/dots-tts-mlx",
          "dots-tts-mlx",
        ],
        { cwd: pythonAppSrcDir },
      );

      if (!cloneCMD.success) {
        console.error("Failed to clone dots-tts-mlx:", cloneCMD.error);
        return false;
      }
    }

    // Install the dots-tts CLI (into ~/.local/bin/dots-tts, which is where
    // `getDotsTtsBin()` resolves it). `uv tool install` does not require a venv.
    const uvPath = await getUvPath();
    const installResult = await runCommand(
      uvPath,
      ["tool", "install", "--editable", "."],
      { cwd: dotsTtsFolder },
    );

    if (!installResult.success) {
      console.error(
        "Failed to install dots-tts:",
        installResult.error || installResult.output,
      );
      return false;
    }

    // Install mlx-whisper (MLX-powered speech-to-text for transcription) as a
    // `uv tool` so its `mlx_whisper` CLI lands in ~/.local/bin, mirroring dots-tts.
    const whisperResult = await runCommand(uvPath, [
      "tool",
      "install",
      "mlx-whisper",
    ]);

    if (!whisperResult.success) {
      console.error(
        "Failed to install mlx-whisper:",
        whisperResult.error || whisperResult.output,
      );
      return false;
    }
  }

  // {
  //   const pythonAppSrcDir = join(APP_DATA_DIR, "python-src");
  //   if (!existsSync(pythonAppSrcDir)) {
  //     mkdirSync(pythonAppSrcDir, { recursive: true });
  //   }

  //   const featureFolder = join(pythonAppSrcDir, "mlx-h3");

  //   if (!existsSync(featureFolder)) {
  //     let cloneCMD = await runCommand(
  //       "git",
  //       [`clone`, `https://github.com/appautomaton/mlx-h3.git`, "mlx-h3"],
  //       { cwd: pythonAppSrcDir },
  //     );

  //     console.log(cloneCMD.success, cloneCMD.output);
  //   }

  //   const uvPath = await getUvPath();

  //   const uvSyncResult = await runCommand(
  //     uvPath,
  //     [
  //       //
  //       "sync",
  //       // "--all-extras",
  //     ],
  //     {
  //       cwd: featureFolder,
  //     },
  //   );
  //   if (!uvSyncResult.success) {
  //     console.error("Failed to install uv in mlx h3:", uvSyncResult.error);
  //     return false;
  //   }

  //   {
  //     const uvSyncResult = await runCommand(
  //       uvPath,
  //       [
  //         //
  //         "tool",
  //         "install",
  //         "--prerelease",
  //         "allow",
  //         "mlx-h3",
  //       ],
  //       {
  //         cwd: featureFolder,
  //       },
  //     );
  //     if (!uvSyncResult.success) {
  //       console.error(
  //         "Failed to install uv mlx-h3 global:",
  //         uvSyncResult.error,
  //       );
  //       return false;
  //     }
  //   }
  // }

  {
    const pythonAppSrcDir = join(APP_DATA_DIR, "python-src");
    if (!existsSync(pythonAppSrcDir)) {
      mkdirSync(pythonAppSrcDir, { recursive: true });
    }

    const featureFolder = join(pythonAppSrcDir, "mlx-audio");

    if (!existsSync(featureFolder)) {
      let cloneCMD = await runCommand(
        "git",
        [
          `clone`,
          `git clone https://github.com/Blaizzy/mlx-audio.git`,
          "mlx-audio",
        ],
        { cwd: pythonAppSrcDir },
      );

      console.log(cloneCMD.success, cloneCMD.output);
    }

    const uvPath = await getUvPath();

    const uvSyncResult = await runCommand(
      uvPath,
      [
        //
        "tool",
        "install",
        "mlx-audio",
        "--force",
        "--prerelease=allow",
      ],
      {
        //
      },
    );

    console.log(uvSyncResult);

    if (!uvSyncResult.success) {
      console.error(
        "Failed to install uv mlx-audio global:",
        uvSyncResult.error,
      );

      return false;
    }
  }

  //

  // {
  //   const uvPath = await getUvPath();
  //   const pythonAppSrcDir = join(APP_DATA_DIR, "python-src");
  //   if (!existsSync(pythonAppSrcDir)) {
  //     mkdirSync(pythonAppSrcDir, { recursive: true });
  //   }

  //   const mlxgenFolder = join(pythonAppSrcDir, "mlxgen");

  //   if (!existsSync(mlxgenFolder)) {
  //     let cloneCMD = await runCommand(
  //       "git",
  //       [`clone`, `https://github.com/lpalbou/mlx-gen`, "mlxgen"],
  //       { cwd: pythonAppSrcDir },
  //     );

  //     console.log(cloneCMD.success, cloneCMD.output);
  //   }

  //   {
  //     const uvSyncResult = await runCommand(
  //       uvPath,
  //       [
  //         //
  //         "tool",
  //         "install",
  //         "--upgrade",
  //         "mlx-gen",
  //       ],
  //       {
  //         cwd: mlxgenFolder,
  //       },
  //     );
  //     if (!uvSyncResult.success) {
  //       console.error("Failed to install mlx-gen tool:", uvSyncResult.error);
  //       return false;
  //     }
  //   }

  //   {
  //     const uvSyncResult = await runCommand(
  //       uvPath,
  //       [
  //         //
  //         "run",
  //         "mlxgen",
  //         "download",
  //         "--model",
  //         "AbstractFramework/qwen-image-edit-2511-4bit",
  //       ],
  //       {
  //         cwd: mlxgenFolder,
  //       },
  //     );
  //     if (!uvSyncResult.success) {
  //       console.error(
  //         "Failed to download mlx-gen AbstractFramework/qwen-image-edit-2511-4bit:",
  //         uvSyncResult.error,
  //       );
  //       return false;
  //     }
  //   }

  //   //
  //   //uv run mlxgen download --model AbstractFramework/qwen-image-edit-2511-4bit
  //   //
  // }

  //
  console.log("Python dependencies installed");
  return true;
}

// ========== Render Helpers ==========

/** Stream stdout/stderr from a process to console and SSE logs. Returns all text. */
async function streamProcessOutput(
  readable: ReadableStream<Uint8Array> | undefined,
  prefix: string,
  send: (event: string, data: object) => void,
): Promise<string> {
  let text = "";
  const reader = readable?.getReader();
  if (!reader) return text;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = new TextDecoder().decode(value);
      console.log(`[${prefix}]`, chunk);
      text += chunk;
      send("log", { text: chunk });
    }
  } finally {
    reader.releaseLock();
  }
  return text;
}

// // ========== Render Functions ==========

// let firstImageProcess: Subprocess | null = null;

// async function testRenderImage({
//   send,
// }: {
//   send: (event: string, data: object) => void;
// }): Promise<boolean> {
//   console.log("Try Render Image...");

//   const pythonAppSrcDir = join(APP_DATA_DIR, "python-src");
//   if (!existsSync(pythonAppSrcDir)) {
//     mkdirSync(pythonAppSrcDir, { recursive: true });
//   }

//   const zImageFolder = join(pythonAppSrcDir, "z-image-mps");
//   const uvPath = await getUvPath();

//   // Kill any previous image process
//   if (firstImageProcess && !firstImageProcess.killed) {
//     firstImageProcess.kill();
//   }

//   if (!existsSync(join(OUTPUT_DIR, "welcome"))) {
//     mkdirSync(join(OUTPUT_DIR, "welcome"), { recursive: true });
//   }

//   const outputPath = join(OUTPUT_DIR, "welcome", "thank-you.png");
//   if (existsSync(outputPath)) {
//     console.log("Image already rendered, skipping.");
//     return true;
//   }

//   firstImageProcess = spawn(
//     [
//       uvPath,
//       "run",
//       "z-image-mps.py",
//       "-p",
//       "A very cute lamb stadning on two feet, two hands at a park. The image is render in kids cartoon 3d movie style. a line of text that says: Thank you so much for using Lambobo AI Studio!",
//       "--aspect",
//       "1:1",
//       "--height",
//       "512",
//       "--width",
//       "512",
//       "--output",
//       outputPath,
//       "--device",
//       "mps",
//     ],
//     {
//       cwd: zImageFolder,
//       stdout: "pipe",
//       stderr: "pipe",
//     },
//   );

//   const proc: Subprocess = firstImageProcess;

//   // Stream stdout and stderr concurrently (cast: we always use "pipe" mode)
//   const stdoutPromise = streamProcessOutput(
//     proc.stdout as ReadableStream<Uint8Array>,
//     "Image",
//     send,
//   );
//   const stderrText = await streamProcessOutput(
//     proc.stderr as ReadableStream<Uint8Array>,
//     "Image",
//     send,
//   );
//   await stdoutPromise;

//   // Wait for process to exit and check result
//   const exitCode = await proc.exited;
//   const success = exitCode === 0 && existsSync(outputPath);

//   if (success) {
//     send("progress", {
//       step: "render-image",
//       status: "completed",
//       label: "Rendering test image...",
//     });
//   } else {
//     send("progress", {
//       step: "render-image",
//       status: "error",
//       label: "Rendering test image...",
//       error: stderrText || `Process exited with code ${exitCode}`,
//     });
//   }

//   return success;
// }

// let firstVideoProcess: Subprocess | null = null;

// async function testRenderVideo({
//   send,
// }: {
//   send: (event: string, data: object) => void;
// }): Promise<boolean> {
//   console.log("Try Render Video...");

//   const pythonAppSrcDir = join(APP_DATA_DIR, "python-src");
//   if (!existsSync(pythonAppSrcDir)) {
//     mkdirSync(pythonAppSrcDir, { recursive: true });
//   }

//   const ltxFolder = join(pythonAppSrcDir, "ltx-2-mlx");
//   const uvPath = await getUvPath();

//   // Kill any previous video process
//   if (firstVideoProcess && !firstVideoProcess.killed) {
//     firstVideoProcess.kill();
//   }

//   if (!existsSync(join(OUTPUT_DIR, "welcome"))) {
//     mkdirSync(join(OUTPUT_DIR, "welcome"), { recursive: true });
//   }

//   const outputPath = join(OUTPUT_DIR, "welcome", "thank-you.mp4");
//   if (existsSync(outputPath)) {
//     console.log("Video already rendered, skipping.");
//     return true;
//   }

//   const lambobo = join(
//     __filename,
//     "..",
//     "..",
//     "python-src",
//     "images",
//     "lambobo.png",
//   );

//   firstVideoProcess = spawn(
//     [
//       uvPath,
//       "run",
//       "ltx-2-mlx",
//       "generate",
//       "--model",
//       "dgrauet/ltx-2.3-mlx-q4",
//       "--prompt",
//       `${JSON.stringify("No text on screen. a 5 years old cute lamb wanting to have a hug, he says: Hi! Thank you for using EffectNode Media!")}`,
//       "--distilled",
//       "--low-ram",
//       "--frames",
//       "121",
//       "--width",
//       "448",
//       "--height",
//       "448",
//       "--frame-rate",
//       "24",
//       "--image",
//       `${lambobo}`,
//       "--output",
//       outputPath,
//     ],
//     {
//       cwd: ltxFolder,
//       stdout: "pipe",
//       stderr: "pipe",
//     },
//   );

//   const proc: Subprocess = firstVideoProcess;

//   // Stream stdout and stderr concurrently (cast: we always use "pipe" mode)
//   const stdoutPromise = streamProcessOutput(
//     proc.stdout as ReadableStream<Uint8Array>,
//     "Video",
//     send,
//   );
//   const stderrText = await streamProcessOutput(
//     proc.stderr as ReadableStream<Uint8Array>,
//     "Video",
//     send,
//   );
//   await stdoutPromise;

//   // Wait for process to exit and check result
//   const exitCode = await proc.exited;
//   const success = exitCode === 0 && existsSync(outputPath);

//   if (success) {
//     send("progress", {
//       step: "render-video",
//       status: "completed",
//       label: "Rendering test video...",
//     });
//   } else {
//     send("progress", {
//       step: "render-video",
//       status: "error",
//       label: "Rendering test video...",
//       error: stderrText || `Process exited with code ${exitCode}`,
//     });
//   }

//   return success;
// }

// // ========== Render Functions ==========

// let firstImageEdit: Subprocess | null = null;

// async function testQwenImageEditGeneration({
//   send,
// }: {
//   send: (event: string, data: object) => void;
// }): Promise<boolean> {
//   const uvPath = await getUvPath();

//   console.log("Try Render Image...");

//   const pythonAppSrcDir = join(APP_DATA_DIR, "python-src");
//   if (!existsSync(pythonAppSrcDir)) {
//     mkdirSync(pythonAppSrcDir, { recursive: true });
//   }

//   const zImageFolder = join(pythonAppSrcDir, "qwen-image-mps");

//   // Kill any previous image process
//   if (firstImageEdit && !firstImageEdit.killed) {
//     firstImageEdit.kill();
//   }

//   if (!existsSync(join(OUTPUT_DIR, "welcome"))) {
//     mkdirSync(join(OUTPUT_DIR, "welcome"), { recursive: true });
//   }

//   //
//   const outputPath = join(OUTPUT_DIR, "welcome", "thank-you-edit.png");
//   if (existsSync(outputPath)) {
//     console.log("Image already rendered, skipping.");
//     return true;
//   }

//   const lambobo = join(
//     __filename,
//     "..",
//     "..",
//     "python-src",
//     "images",
//     "lambobo.png",
//   );

//   firstImageEdit = spawn(
//     [
//       uvPath,
//       "run",
//       "qwen-image-mps",
//       "edit",
//       "-i",
//       JSON.stringify(lambobo),
//       "-p",
//       "Change the background to sunset",
//       "--ultra-fast",
//       "--quantization",
//       "Q4_0",
//       "--output",
//       JSON.stringify(outputPath),
//     ],
//     {
//       cwd: zImageFolder,
//       stdout: "pipe",
//       stderr: "pipe",
//     },
//   );

//   const proc: Subprocess = firstImageEdit;

//   // Stream stdout and stderr concurrently (cast: we always use "pipe" mode)
//   const stdoutPromise = streamProcessOutput(
//     proc.stdout as ReadableStream<Uint8Array>,
//     "EditImage",
//     send,
//   );
//   const stderrText = await streamProcessOutput(
//     proc.stderr as ReadableStream<Uint8Array>,
//     "EditImage",
//     send,
//   );
//   await stdoutPromise;

//   // Wait for process to exit and check result
//   const exitCode = await proc.exited;
//   const success = exitCode === 0 && existsSync(outputPath);

//   if (success) {
//     send("progress", {
//       step: "edit-image",
//       status: "completed",
//       label: "Processing edit image task...",
//     });
//   } else {
//     send("progress", {
//       step: "edit-image",
//       status: "error",
//       label: "Processing edit image task...",
//       error: stderrText || `Process exited with code ${exitCode}`,
//     });
//   }

//   return success;
// }

// // ========== Render Functions ==========

// let firstQwenImageGen: Subprocess | null = null;

// async function testQwenImageGeneration({
//   send,
// }: {
//   send: (event: string, data: object) => void;
// }): Promise<boolean> {
//   console.log("Try Generate Image...");

//   const pythonAppSrcDir = join(APP_DATA_DIR, "python-src");
//   if (!existsSync(pythonAppSrcDir)) {
//     mkdirSync(pythonAppSrcDir, { recursive: true });
//   }

//   const binaryFolder = join(pythonAppSrcDir, "qwen-image-mps");
//   const uvPath = await getUvPath();

//   // Kill any previous image process
//   if (firstQwenImageGen && !firstQwenImageGen.killed) {
//     firstQwenImageGen.kill();
//   }

//   if (!existsSync(join(OUTPUT_DIR, "welcome"))) {
//     mkdirSync(join(OUTPUT_DIR, "welcome"), { recursive: true });
//   }

//   //
//   const outputPath = join(
//     OUTPUT_DIR,
//     "welcome",
//     "thank-you-qwen-image-gen.png",
//   );
//   // const outputFolderPath = join(OUTPUT_DIR, "welcome");
//   if (existsSync(outputPath)) {
//     console.log("Image already rendered, skipping.");
//     return true;
//   }

//   // const lambobo = join(
//   //   __filename,
//   //   "..",
//   //   "..",
//   //   "python-src",
//   //   "images",
//   //   "lambobo.png",
//   // );

//   let tempFolder = join(
//     OUTPUT_DIR,
//     "welcome",
//     "generation-temp",
//     `_${Math.random().toString(36).slice(2, 9)}`,
//   );
//   mkdirSync(tempFolder, { recursive: true });

//   firstQwenImageGen = spawn(
//     [
//       uvPath,
//       "run",
//       "qwen-image-mps",
//       "generate",

//       "-p",
//       "Draw a sunset",
//       "--outdir",
//       JSON.stringify(tempFolder),
//       "--ultra-fast",
//       "--quantization",
//       "Q4_0",
//       "--aspect",
//       "16:9",
//     ],
//     {
//       cwd: binaryFolder,
//       stdout: "pipe",
//       stderr: "pipe",
//     },
//   );

//   const proc: Subprocess = firstQwenImageGen;

//   // Stream stdout and stderr concurrently (cast: we always use "pipe" mode)
//   const stdoutPromise = streamProcessOutput(
//     proc.stdout as ReadableStream<Uint8Array>,
//     "QwenImageGen",
//     send,
//   );
//   const stderrText = await streamProcessOutput(
//     proc.stderr as ReadableStream<Uint8Array>,
//     "QwenImageGen",
//     send,
//   );
//   await stdoutPromise;

//   // Wait for process to exit and check result
//   const exitCode = await proc.exitCode;
//   const success = exitCode === 0;

//   if (success) {
//     // please list the first file in tempFolder

//     async function listFiles(directoryPath: string) {
//       try {
//         const files = await readdir(directoryPath);
//         console.log(files); // Array of file and folder names

//         return files;
//       } catch (err) {
//         console.error("Error reading directory:", err);
//         return [];
//       }
//     }

//     const items = await listFiles(`${tempFolder}`);

//     for await (let item of items) {
//       if (item.includes(".png")) {
//         await rename(item, join(outputPath));
//       }
//     }
//     unlinkSync(tempFolder);

//     send("progress", {
//       step: "qwen-image",
//       status: "completed",
//       label: "Test qwen image generation...",
//     });
//   } else {
//     send("progress", {
//       step: "qwen-image",
//       status: "error",
//       label: "Test qwen image generation...",
//       error: stderrText || `Process exited with code ${exitCode}`,
//     });
//   }

//   return success;
// }

// ========== Application Menu ==========
// Electron-only: disabled after the Bun → Node.js migration. `ApplicationMenu`
// is no longer imported, so this would throw `ReferenceError` at module load.

/*
ApplicationMenu.setApplicationMenu([
  {
    label: `Lambobo AI Studio`,
    submenu: [
      { role: "about" },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "showAll" },
      { type: "separator" },
      { role: "quit" },
    ],
  },
  {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "pasteAndMatchStyle" },
      { role: "delete" },
      { role: "selectAll" },
    ],
  },
  {
    label: "Window",
    submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "close" }],
  },
]);
*/
