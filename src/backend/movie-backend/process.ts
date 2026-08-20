// Node.js replacement for the `bun` process API used across the backend.
//
// Bun's `spawn` returns a `Subprocess` whose stdout/stderr are WHATWG
// `ReadableStream`s and whose `exited` is a Promise<number>. Node's
// `child_process.spawn` returns a `ChildProcess` with Node streams and an
// `exit` event instead. This module adapts Node's API to the Bun-shaped API so
// the rest of the codebase keeps working unchanged.

import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import { Readable } from "node:stream";
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";

export interface Subprocess {
  stdout: ReadableStream<Uint8Array> | null;
  stderr: ReadableStream<Uint8Array> | null;
  /** Resolves to the process exit code (or -1 when the process failed to spawn). */
  exited: Promise<number>;
  /** True once the process has been killed or has already exited. */
  readonly killed: boolean;
  kill(): void;
}

export interface SpawnOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdout?: "pipe" | "ignore" | "inherit";
  stderr?: "pipe" | "ignore" | "inherit";
  onExit?: (
    proc: Subprocess,
    exitCode: number,
    signalCode: NodeJS.Signals | null,
    error?: Error,
  ) => void;
}

/** Convert a Node readable stream into a WHATWG ReadableStream (null-safe). */
function toWeb(
  stream: NodeJS.ReadableStream | null,
): ReadableStream<Uint8Array> | null {
  if (!stream) return null;
  return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
}

export function spawn(args: string[], options: SpawnOptions = {}): Subprocess {
  const [command, ...rest] = args;

  const child: ChildProcess = nodeSpawn(command, rest, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["ignore", options.stdout ?? "pipe", options.stderr ?? "pipe"],
    shell: false,
  });

  let killed = false;

  const proc: Subprocess = {
    stdout: toWeb(child.stdout),
    stderr: toWeb(child.stderr),
    get killed() {
      return killed || child.killed || child.exitCode !== null;
    },
    kill() {
      killed = true;
      child.kill();
    },
    exited: new Promise<number>((resolve) => {
      child.once("error", (err) => {
        killed = true;
        options.onExit?.(proc, -1, null, err);
        resolve(-1);
      });
      child.once("exit", (code, signal) => {
        options.onExit?.(proc, code ?? -1, signal, undefined);
        resolve(code ?? -1);
      });
    }),
  };

  return proc;
}

/** Synchronously resolve an executable from PATH (Bun's `Bun.which`). */
export function whichSync(cmd: string): string | null {
  if (cmd.includes("/") || cmd.includes("\\")) {
    return isExecutable(cmd) ? cmd : null;
  }
  const path = process.env.PATH ?? "";
  for (const dir of path.split(delimiter).filter(Boolean)) {
    const full = join(dir, cmd);
    if (isExecutable(full)) return full;
  }
  return null;
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".opus": "audio/opus",
};

/** Guess a content type from a filename extension (Bun's `Bun.file().type`). */
export function mimeType(path: string): string {
  const i = path.lastIndexOf(".");
  if (i === -1) return "application/octet-stream";
  return MIME_TYPES[path.slice(i).toLowerCase()] ?? "application/octet-stream";
}
