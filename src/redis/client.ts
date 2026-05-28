import { Redis } from "ioredis";
import { env } from "../config/env.js";

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 2,
  lazyConnect: true
});

export async function connectRedis() {
  if (redis.status === "wait") {
    await redis.connect();
  }
}

export async function checkRedis() {
  await connectRedis();
  return (await redis.ping()) === "PONG";
}
