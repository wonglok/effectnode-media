import type { Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { handleMessage } from "./messages.js";

export function createWsServer(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  const broadcast = (text: string) => {
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(text);
      }
    }
  };

  wss.on("connection", (socket) => {
    console.log("[ws] client connected");

    socket.on("message", (data) => {
      const text = data.toString();
      console.log("[ws] received:", text);
      handleMessage(text, { broadcast });
    });

    socket.on("close", () => console.log("[ws] client disconnected"));
  });

  // Broadcast a clock tick to every connected client every 5 seconds.
  const tick = setInterval(() => {
    broadcast(`clock: ${new Date().toISOString()}`);
  }, 5000);

  wss.on("close", () => clearInterval(tick));

  return wss;
}
