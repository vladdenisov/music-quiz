import { z } from "zod";
import {
  GENERATION_DECADES,
  GENERATION_DIFFICULTY,
  GENERATION_EXPLICITNESS,
  GENERATION_GENRES,
  GENERATION_LANGUAGES,
  GENERATION_MOODS,
  GENERATION_POPULARITY,
  GENERATION_REGIONS
} from "./generation-options.js";
import { QUESTION_MODES, ROUND_DURATIONS, ROUNDS_COUNTS, SOURCE_PROVIDERS, SOURCE_TYPES } from "./types.js";

const generationFiltersSchema = z.object({
  language: z.enum(GENERATION_LANGUAGES).optional(),
  decades: z.array(z.enum(GENERATION_DECADES)).min(1).max(8).optional(),
  genres: z.array(z.enum(GENERATION_GENRES)).min(1).max(6).optional(),
  moods: z.array(z.enum(GENERATION_MOODS)).min(1).max(6).optional(),
  region: z.enum(GENERATION_REGIONS).optional(),
  popularity: z.enum(GENERATION_POPULARITY).optional(),
  difficulty: z.enum(GENERATION_DIFFICULTY).optional(),
  explicitness: z.enum(GENERATION_EXPLICITNESS).optional()
});

export const gameSettingsSchema = z.object({
  roundsCount: z.union(ROUNDS_COUNTS.map((value) => z.literal(value)) as [z.ZodLiteral<5>, z.ZodLiteral<10>, z.ZodLiteral<15>]),
  roundDurationSec: z.union(ROUND_DURATIONS.map((value) => z.literal(value)) as [z.ZodLiteral<5>, z.ZodLiteral<10>, z.ZodLiteral<15>]),
  questionMode: z.enum(QUESTION_MODES),
  answerOptionsCount: z.literal(4),
  source: z.object({
    provider: z.enum(SOURCE_PROVIDERS).optional().default("spotify"),
    type: z.enum(SOURCE_TYPES),
    value: z.string().trim().min(1).max(300).optional(),
    market: z.string().trim().min(2).max(10).optional().default("US"),
    filters: generationFiltersSchema.optional()
  })
});

export const defaultGameSettings = {
  roundsCount: 10,
  roundDurationSec: 10,
  questionMode: "mixed",
  answerOptionsCount: 4,
  source: {
    type: "random",
    market: "US"
  }
} as const;

export const nicknameSchema = z.string().trim().min(1).max(32);

export const createRoomSchema = z.object({
  nickname: nicknameSchema,
  settings: gameSettingsSchema.partial().optional()
});

export const joinRoomSchema = z.object({
  nickname: nicknameSchema
});

export const startGameSchema = z.object({
  playerId: z.string().uuid(),
  settings: gameSettingsSchema.optional()
});

export const trackGenerateSchema = z.object({
  settings: gameSettingsSchema
});

export const socketJoinSchema = z.object({
  roomCode: z.string().trim().min(4).max(12),
  playerId: z.string().uuid()
});

export const socketStartSchema = z.object({
  roomCode: z.string().trim().min(4).max(12),
  playerId: z.string().uuid(),
  settings: gameSettingsSchema.optional()
});

export const socketAnswerSchema = z.object({
  roomCode: z.string().trim().min(4).max(12),
  playerId: z.string().uuid(),
  roundId: z.string().uuid(),
  selectedOptionId: z.string().trim().min(1),
  clientAnsweredAt: z.string().datetime().optional()
});

export const socketNextRoundSchema = z.object({
  roomCode: z.string().trim().min(4).max(12),
  playerId: z.string().uuid()
});

export const socketUpdateNameSchema = z.object({
  roomCode: z.string().trim().min(4).max(12),
  playerId: z.string().uuid(),
  nickname: nicknameSchema
});
