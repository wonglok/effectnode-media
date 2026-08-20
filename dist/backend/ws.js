import { WebSocketServer, WebSocket } from "ws";
export function createWsServer(server) {
    const wss = new WebSocketServer({ server, path: "/ws" });
    wss.on("connection", (socket) => {
        console.log("[ws] client connected");
        socket.on("message", (data) => {
            const text = data.toString();
            console.log("[ws] received:", text);
            // Broadcast back to all connected clients.
            for (const client of wss.clients) {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(`echo: ${text}`);
                }
            }
        });
        socket.on("close", () => console.log("[ws] client disconnected"));
    });
    // Broadcast a clock tick to every connected client every 5 seconds.
    const tick = setInterval(() => {
        const now = new Date().toISOString();
        for (const client of wss.clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(`clock: ${now}`);
            }
        }
    }, 5000);
    wss.on("close", () => clearInterval(tick));
    return wss;
}
