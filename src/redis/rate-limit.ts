import { AppError } from "../domain/errors.js";
import { connectRedis, redis } from "./client.js";

type RateLimitParams = {
  key: string;
  limit: number;
  windowSec: number;
};

export async function assertRateLimit(params: RateLimitParams) {
  await connectRedis();
  const current = await redis.incr(params.key);

  if (current === 1) {
    await redis.expire(params.key, params.windowSec);
  }

  if (current > params.limit) {
    throw new AppError("RATE_LIMITED", "Too many requests", 429);
  }
}
