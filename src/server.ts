import { serve } from "@hono/node-server";
import { env } from "./config/env.js";
import { pool } from "./db/client.js";
import { redis } from "./redis/client.js";
import { app } from "./http/app.js";
import { attachSocketServer } from "./ws/socket.js";

const server = serve(
  {
    fetch: app.fetch,
    port: env.PORT
  },
  (info) => {
    console.log(`Music Quiz backend listening on http://localhost:${info.port}`);
  }
);

attachSocketServer(server);

async function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down`);
  server.close();
  await Promise.allSettled([pool.end(), redis.quit()]);
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
