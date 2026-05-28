import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { ZodError } from "zod";
import { env } from "../config/env.js";
import { checkDatabase } from "../db/client.js";
import { AppError, toErrorResponse } from "../domain/errors.js";
import { getGenerationOptions } from "../domain/generation-options.js";
import { joinRoomSchema, startGameSchema, trackGenerateSchema } from "../domain/validation.js";
import { checkRedis } from "../redis/client.js";
import { startGame } from "../services/game-service.js";
import { createRoom, getPublicRoomState, joinRoom } from "../services/room-service.js";
import { generateTracksForGame, getTrackById } from "../services/track-service.js";

export const app = new Hono();

const corsOrigins = env.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean);

app.use(
  "*",
  cors({
    origin: corsOrigins.length === 1 && corsOrigins[0] === "*" ? "*" : corsOrigins,
    credentials: corsOrigins[0] !== "*"
  })
);
app.use("*", logger());

app.onError((error, c) => {
  if (error instanceof ZodError) {
    return c.json(
      {
        error: {
          code: "BAD_REQUEST",
          message: "Invalid request payload",
          issues: error.issues
        }
      },
      400
    );
  }

  const response = toErrorResponse(error);
  return c.json(response.body, response.status as never);
});

app.get("/health", async (c) => {
  const checks = await Promise.allSettled([checkDatabase(), checkRedis()]);

  const database = checks[0].status === "fulfilled" && checks[0].value;
  const redis = checks[1].status === "fulfilled" && checks[1].value;
  const ok = database && redis;

  return c.json(
    {
      service: "music-quiz-backend",
      ok,
      checks: {
        database,
        redis
      }
    },
    ok ? 200 : 503
  );
});

app.post("/rooms", async (c) => {
  const body = await c.req.json();
  const result = await createRoom(body, getIp(c.req.raw));
  return c.json(result, 201);
});

app.get("/rooms/:roomCode", async (c) => {
  const state = await getPublicRoomState(c.req.param("roomCode"));
  return c.json(state);
});

app.post("/rooms/:roomCode/join", async (c) => {
  const body = joinRoomSchema.parse(await c.req.json());
  const result = await joinRoom(c.req.param("roomCode"), body, getIp(c.req.raw));
  return c.json(result, 201);
});

app.post("/rooms/:roomCode/start", async (c) => {
  const body = startGameSchema.parse(await c.req.json());
  const state = await startGame(c.req.param("roomCode"), body.playerId, body.settings, getIp(c.req.raw));
  return c.json(state);
});

app.post("/tracks/generate", async (c) => {
  const body = trackGenerateSchema.parse(await c.req.json());
  const tracks = await generateTracksForGame(body.settings);
  return c.json({
    tracks: tracks.map((track) => ({
      id: track.id,
      artist: track.artist,
      title: track.title,
      album: track.album,
      artworkUrl: track.artworkUrl,
      previewProvider: track.previewProvider,
      matchScore: track.matchScore
    }))
  });
});

app.get("/tracks/generation-options", (c) => {
  return c.json(getGenerationOptions());
});

app.get("/tracks/:id", async (c) => {
  const track = await getTrackById(c.req.param("id"));
  return c.json({
    id: track.id,
    source: track.source,
    sourceTrackId: track.sourceTrackId,
    isrc: track.isrc,
    artist: track.artist,
    title: track.title,
    album: track.album,
    durationMs: track.durationMs,
    previewProvider: track.previewProvider,
    artworkUrl: track.artworkUrl,
    genre: track.genre,
    releaseYear: track.releaseYear,
    popularity: track.popularity,
    matchScore: track.matchScore
  });
});

app.notFound((c) => {
  const error = new AppError("BAD_REQUEST", "Route not found", 404);
  const response = toErrorResponse(error);
  return c.json(response.body, 404);
});

function getIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
