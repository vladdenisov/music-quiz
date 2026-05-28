import { z } from "zod";
import 'dotenv/config';

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url().default("postgres://music_quiz:music_quiz@localhost:5432/music_quiz"),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  SPOTIFY_CLIENT_ID: z.string().optional().default(""),
  SPOTIFY_CLIENT_SECRET: z.string().optional().default(""),
  DEEZER_ENABLED: z.coerce.boolean().default(true),
  SPOTIFY_RUSSIAN_PLAYLIST_IDS: z.string().default(""),
  LASTFM_API_KEY: z.string().optional().default(""),
  ROUND_RESULT_DELAY_MS: z.coerce.number().int().min(0).default(3000),
  CORS_ORIGIN: z.string().default("*")
});

export const env = envSchema.parse(process.env);
