import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import {
  GAME_STATUSES,
  QUESTION_TYPES,
  ROOM_STATUSES,
  ROUND_STATUSES
} from "../domain/types.js";
import type { AnswerOption, GameSettings } from "../domain/types.js";

export const roomStatusEnum = pgEnum("room_status", ROOM_STATUSES);
export const gameStatusEnum = pgEnum("game_status", GAME_STATUSES);
export const roundStatusEnum = pgEnum("round_status", ROUND_STATUSES);
export const questionTypeEnum = pgEnum("question_type", QUESTION_TYPES);

export const players = pgTable("players", {
  id: uuid("id").primaryKey().defaultRandom(),
  nickname: text("nickname").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    hostPlayerId: uuid("host_player_id").notNull().references(() => players.id),
    status: roomStatusEnum("status").notNull().default("lobby"),
    settings: jsonb("settings").$type<GameSettings>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    codeUnique: uniqueIndex("rooms_code_unique").on(table.code)
  })
);

export const roomPlayers = pgTable(
  "room_players",
  {
    roomId: uuid("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
    playerId: uuid("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
    score: integer("score").notNull().default(0),
    isConnected: boolean("is_connected").notNull().default(false),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true })
  },
  (table) => ({
    pk: primaryKey({ columns: [table.roomId, table.playerId] }),
    playerIndex: index("room_players_player_idx").on(table.playerId)
  })
);

export const games = pgTable(
  "games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
    status: gameStatusEnum("status").notNull().default("pending"),
    settings: jsonb("settings").$type<GameSettings>().notNull(),
    currentRoundNumber: integer("current_round_number").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true })
  },
  (table) => ({
    roomIndex: index("games_room_idx").on(table.roomId)
  })
);

export const tracks = pgTable(
  "tracks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(),
    sourceTrackId: text("source_track_id").notNull(),
    isrc: text("isrc"),
    artist: text("artist").notNull(),
    title: text("title").notNull(),
    album: text("album"),
    durationMs: integer("duration_ms"),
    previewUrl: text("preview_url").notNull(),
    previewProvider: text("preview_provider").notNull(),
    artworkUrl: text("artwork_url"),
    genre: text("genre"),
    releaseYear: integer("release_year"),
    popularity: integer("popularity"),
    matchScore: integer("match_score").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    sourceUnique: uniqueIndex("tracks_source_track_unique").on(table.source, table.sourceTrackId),
    isrcIndex: index("tracks_isrc_idx").on(table.isrc),
    contextIndex: index("tracks_context_idx").on(table.genre, table.releaseYear, table.popularity)
  })
);

export const rounds = pgTable(
  "rounds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
    trackId: uuid("track_id").notNull().references(() => tracks.id),
    roundNumber: integer("round_number").notNull(),
    questionType: questionTypeEnum("question_type").notNull(),
    questionText: text("question_text").notNull(),
    correctOptionId: text("correct_option_id").notNull(),
    correctAnswer: text("correct_answer").notNull(),
    options: jsonb("options").$type<AnswerOption[]>().notNull(),
    roundStartedAt: timestamp("round_started_at", { withTimezone: true }),
    roundEndsAt: timestamp("round_ends_at", { withTimezone: true }),
    roundDurationSec: integer("round_duration_sec").notNull(),
    status: roundStatusEnum("status").notNull().default("pending")
  },
  (table) => ({
    gameRoundUnique: uniqueIndex("rounds_game_round_unique").on(table.gameId, table.roundNumber),
    gameStatusIndex: index("rounds_game_status_idx").on(table.gameId, table.status)
  })
);

export const answers = pgTable(
  "answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roundId: uuid("round_id").notNull().references(() => rounds.id, { onDelete: "cascade" }),
    playerId: uuid("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
    selectedOptionId: text("selected_option_id").notNull(),
    answer: text("answer").notNull(),
    isCorrect: boolean("is_correct").notNull(),
    score: integer("score").notNull(),
    answeredAt: timestamp("answered_at", { withTimezone: true }).notNull(),
    clientAnsweredAt: timestamp("client_answered_at", { withTimezone: true })
  },
  (table) => ({
    oneAnswerPerRound: uniqueIndex("answers_round_player_unique").on(table.roundId, table.playerId),
    roundIndex: index("answers_round_idx").on(table.roundId)
  })
);

export const trackMatches = pgTable(
  "track_matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceTrackId: text("source_track_id").notNull(),
    provider: text("provider").notNull(),
    providerTrackId: text("provider_track_id").notNull(),
    score: integer("score").notNull(),
    previewUrl: text("preview_url").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    providerUnique: uniqueIndex("track_matches_provider_unique").on(table.sourceTrackId, table.provider, table.providerTrackId)
  })
);

export const rejectedTrackMatches = pgTable(
  "rejected_track_matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceTrackId: text("source_track_id").notNull(),
    provider: text("provider").notNull(),
    providerTrackId: text("provider_track_id").notNull(),
    reason: text("reason").notNull(),
    score: integer("score").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    providerRejectedUnique: uniqueIndex("rejected_track_matches_provider_unique").on(
      table.sourceTrackId,
      table.provider,
      table.providerTrackId
    )
  })
);

export const roomsRelations = relations(rooms, ({ one, many }) => ({
  host: one(players, { fields: [rooms.hostPlayerId], references: [players.id] }),
  roomPlayers: many(roomPlayers),
  games: many(games)
}));

export const roomPlayersRelations = relations(roomPlayers, ({ one }) => ({
  room: one(rooms, { fields: [roomPlayers.roomId], references: [rooms.id] }),
  player: one(players, { fields: [roomPlayers.playerId], references: [players.id] })
}));

export const gamesRelations = relations(games, ({ one, many }) => ({
  room: one(rooms, { fields: [games.roomId], references: [rooms.id] }),
  rounds: many(rounds)
}));

export const roundsRelations = relations(rounds, ({ one, many }) => ({
  game: one(games, { fields: [rounds.gameId], references: [games.id] }),
  track: one(tracks, { fields: [rounds.trackId], references: [tracks.id] }),
  answers: many(answers)
}));
