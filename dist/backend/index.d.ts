export interface BackendOptions {
    port?: number;
}
/**
 * Create and start the Express backend: CORS + REST API (mounted at /api) and
 * a WebSocket server (at /ws) on the same HTTP server.
 */
export declare function createBackendServer(options?: BackendOptions): Promise<any>;
