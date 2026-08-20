import type { Server } from "node:http";
import { WebSocket } from "ws";
export declare function createWsServer(server: Server): import("ws").Server<typeof WebSocket, typeof import("http").IncomingMessage>;
