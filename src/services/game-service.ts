import { and, asc, eq, sql } from "drizzle-orm";
import { env } from "../config/env.js";
import { db } from "../db/client.js";
import { answers, games, roomPlayers, rooms, rounds, tracks } from "../db/schema.js";
import { buildAnswerOptions } from "../domain/distractors.js";
import { normalizeMusicText } from "../domain/normalize.js";
import { AppError } from "../domain/errors.js";
import { calculateScore } from "../domain/scoring.js";
import type { GamePreparingState, GameSettings, PublicRoundState, QuestionType, RoundResultState } from "../domain/types.js";
import { gameSettingsSchema } from "../domain/validation.js";
import { assertRateLimit } from "../redis/rate-limit.js";
import { getPublicRoomState, getRoomByCode, assertPlayerInRoom } from "./room-service.js";
import { ensureFreshPreview, generateTracksForGame, getDistractorPool, getTracksByIds, type StoredTrack } from "./track-service.js";

type GameEvents = {
  roomState?: (roomCode: string) => Promise<void>;
  gamePreparing?: (roomCode: string, state: GamePreparingState) => Promise<void>;
  gameStarted?: (roomCode: string) => Promise<void>;
  roundStarted?: (roomCode: string, state: PublicRoundState) => Promise<void>;
  roundEnded?: (roomCode: string, result: RoundResultState) => Promise<void>;
  leaderboardUpdated?: (roomCode: string) => Promise<void>;
  gameEnded?: (roomCode: string) => Promise<void>;
};

const roundTimers = new Map<string, NodeJS.Timeout>();
const nextRoundTimers = new Map<string, NodeJS.Timeout>();
let events: GameEvents = {};

export function configureGameEvents(nextEvents: GameEvents) {
  events = nextEvents;
}

export async function startGame(roomCode: string, playerId: string, settingsInput?: unknown, ip = "unknown") {
  await assertRateLimit({ key: `rate:start-game:${roomCode}:${ip}`, limit: 10, windowSec: 60 });

  const room = await getRoomByCode(roomCode);
  if (room.hostPlayerId !== playerId) {
    throw new AppError("HOST_ONLY", "Only host can start the game", 403);
  }
  if (room.status !== "lobby" && room.status !== "ended") {
    throw new AppError("GAME_ALREADY_STARTED", "Game already started", 409);
  }

  const settings = gameSettingsSchema.parse(settingsInput ?? room.settings);
  if (room.status === "ended") {
    await db.update(roomPlayers).set({ score: 0 }).where(eq(roomPlayers.roomId, room.id));
  }

  const targetTracks = getTargetTracksCount(settings);
  await emitPreparing(room.code, settings, targetTracks, {
    phase: "queued",
    message: "Готовим игру"
  });

  let generatedTracks: StoredTrack[];
  try {
    generatedTracks = await generateTracksForGame(settings, {
      onProgress: async (progress) => {
        await emitPreparing(room.code, settings, targetTracks, progress);
      }
    });
  } catch (error) {
    await emitPreparing(room.code, settings, targetTracks, {
      phase: "failed",
      message: "Не удалось собрать плейлист"
    });
    throw error;
  }

  const selectedTracks = generatedTracks.slice(0, settings.roundsCount);

  await emitPreparing(room.code, settings, targetTracks, {
    phase: "building_rounds",
    message: "Собираем раунды",
    matchedTracks: generatedTracks.length
  });

  const [game] = await db
    .insert(games)
    .values({
      roomId: room.id,
      status: "active",
      settings,
      startedAt: new Date()
    })
    .returning();

  if (!game) throw new AppError("BAD_REQUEST", "Could not create game", 500);

  const recentSongLabels: string[] = [];
  const recentArtistLabels: string[] = [];
  const RECENT_LABELS_WINDOW = 4;

  for (let index = 0; index < selectedTracks.length; index += 1) {
    const track = selectedTracks[index]!;
    const questionType = pickQuestionType(settings.questionMode);
    const pool = [...generatedTracks, ...(await getDistractorPool(track))];
    const excludeLabels = new Set(questionType === "guess_song" ? recentSongLabels : recentArtistLabels);
    let options;
    try {
      options = buildAnswerOptions({
        questionType,
        correctTrack: toOptionTrack(track),
        candidateTracks: pool.map(toOptionTrack),
        excludeLabels
      });
    } catch {
      options = buildAnswerOptions({
        questionType,
        correctTrack: toOptionTrack(track),
        candidateTracks: pool.map(toOptionTrack)
      });
    }

    const usedLabels = options.options
      .filter((option) => option.id !== options.correctOptionId)
      .map((option) => normalizeMusicText(option.label));
    const labelSink = questionType === "guess_song" ? recentSongLabels : recentArtistLabels;
    labelSink.push(...usedLabels);
    while (labelSink.length > RECENT_LABELS_WINDOW * 3) labelSink.shift();

    await db.insert(rounds).values({
      gameId: game.id,
      trackId: track.id,
      roundNumber: index + 1,
      questionType,
      questionText: questionType === "guess_song" ? "What is the song title?" : "Who is the artist?",
      correctOptionId: options.correctOptionId,
      correctAnswer: options.correctAnswer,
      options: options.options,
      roundDurationSec: settings.roundDurationSec,
      status: "pending"
    });
  }

  await db.update(rooms).set({ status: "in_game", settings, updatedAt: new Date() }).where(eq(rooms.id, room.id));

  await events.gameStarted?.(room.code);
  await events.roomState?.(room.code);
  await emitPreparing(room.code, settings, targetTracks, {
    phase: "ready",
    message: "Игра готова",
    matchedTracks: generatedTracks.length
  });
  return startRound(room.code, game.id, 1);
}

export async function submitAnswer(input: {
  roomCode: string;
  playerId: string;
  roundId: string;
  selectedOptionId: string;
  clientAnsweredAt?: string;
}) {
  const room = await getRoomByCode(input.roomCode);
  await assertPlayerInRoom(room.id, input.playerId);

  const [row] = await db
    .select({ round: rounds })
    .from(rounds)
    .innerJoin(games, eq(games.id, rounds.gameId))
    .where(and(eq(games.roomId, room.id), eq(rounds.id, input.roundId)));

  if (!row) throw new AppError("ROUND_NOT_ACTIVE", "Round not found", 404);
  const round = row.round;

  if (round.status !== "active" || !round.roundStartedAt || !round.roundEndsAt) {
    throw new AppError("ROUND_NOT_ACTIVE", "Round is not active", 409);
  }

  const selected = round.options.find((option) => option.id === input.selectedOptionId);
  if (!selected) {
    throw new AppError("OPTION_NOT_FOUND", "Selected option does not exist in this round", 400);
  }

  const [existing] = await db
    .select()
    .from(answers)
    .where(and(eq(answers.roundId, round.id), eq(answers.playerId, input.playerId)));

  if (existing) {
    throw new AppError("ANSWER_ALREADY_SUBMITTED", "Player already answered this round", 409);
  }

  const answeredAt = new Date();
  if (answeredAt.getTime() > round.roundEndsAt.getTime()) {
    throw new AppError("ANSWER_TOO_LATE", "Answer arrived after round ended", 409);
  }

  const isCorrect = selected.id === round.correctOptionId;
  const score = calculateScore({
    isCorrect,
    answeredAtMs: answeredAt.getTime(),
    roundStartedAtMs: round.roundStartedAt.getTime(),
    roundDurationMs: round.roundDurationSec * 1000
  });

  await db.insert(answers).values({
    roundId: round.id,
    playerId: input.playerId,
    selectedOptionId: selected.id,
    answer: selected.label,
    isCorrect,
    score,
    answeredAt,
    clientAnsweredAt: input.clientAnsweredAt ? new Date(input.clientAnsweredAt) : null
  });

  if (score > 0) {
    await db
      .update(roomPlayers)
      .set({ score: sql`${roomPlayers.score} + ${score}` })
      .where(and(eq(roomPlayers.roomId, room.id), eq(roomPlayers.playerId, input.playerId)));
  }

  await events.leaderboardUpdated?.(room.code);

  if (await hasEveryConnectedPlayerAnswered(room.id, round.id)) {
    setTimeout(() => {
      void endRound(room.code, round.id);
    }, 0);
  }

  return {
    accepted: true,
    selectedOptionId: selected.id,
    answeredAt: answeredAt.toISOString(),
    score
  };
}

export async function nextRound(roomCode: string, playerId: string) {
  const room = await getRoomByCode(roomCode);
  if (room.hostPlayerId !== playerId) {
    throw new AppError("HOST_ONLY", "Only host can advance the round", 403);
  }

  const currentGame = await getActiveGame(room.id);
  const [currentRound] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.gameId, currentGame.id), eq(rounds.roundNumber, currentGame.currentRoundNumber)));

  if (currentRound?.status === "active") {
    await endRound(room.code, currentRound.id);
  } else {
    await startNextRoundOrEndGame(room.code, currentGame.id, currentGame.currentRoundNumber);
  }
}

export async function getLeaderboard(roomCode: string) {
  const state = await getPublicRoomState(roomCode);
  return state.players
    .map((player) => ({ playerId: player.id, nickname: player.nickname, score: player.score }))
    .sort((left, right) => right.score - left.score);
}

async function startRound(roomCode: string, gameId: string, roundNumber: number) {
  const [row] = await db
    .select({ round: rounds, track: tracks, game: games })
    .from(rounds)
    .innerJoin(tracks, eq(tracks.id, rounds.trackId))
    .innerJoin(games, eq(games.id, rounds.gameId))
    .where(and(eq(rounds.gameId, gameId), eq(rounds.roundNumber, roundNumber)));

  if (!row) {
    await endGame(roomCode, gameId);
    return undefined;
  }

  const freshTrack = await ensureFreshPreview(row.track, row.game.settings.source.market ?? "US");

  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + row.round.roundDurationSec * 1000);
  await db
    .update(rounds)
    .set({ status: "active", roundStartedAt: startedAt, roundEndsAt: endsAt })
    .where(eq(rounds.id, row.round.id));

  await db.update(games).set({ currentRoundNumber: roundNumber }).where(eq(games.id, gameId));

  const publicState: PublicRoundState = {
    roundId: row.round.id,
    roundNumber: row.round.roundNumber,
    questionType: row.round.questionType,
    questionText: row.round.questionText,
    previewUrl: freshTrack.previewUrl,
    artworkUrl: freshTrack.artworkUrl ?? undefined,
    options: row.round.options,
    roundStartedAt: startedAt.toISOString(),
    roundEndsAt: endsAt.toISOString(),
    durationSec: row.round.roundDurationSec as PublicRoundState["durationSec"]
  };

  clearRoundTimer(row.round.id);
  roundTimers.set(
    row.round.id,
    setTimeout(() => {
      void endRound(roomCode, row.round.id);
    }, Math.max(0, endsAt.getTime() - Date.now()))
  );

  await events.roundStarted?.(roomCode, publicState);
  await events.roomState?.(roomCode);
  return publicState;
}

async function endRound(roomCode: string, roundId: string) {
  clearRoundTimer(roundId);

  const [row] = await db
    .select({ round: rounds, track: tracks, game: games })
    .from(rounds)
    .innerJoin(tracks, eq(tracks.id, rounds.trackId))
    .innerJoin(games, eq(games.id, rounds.gameId))
    .where(eq(rounds.id, roundId));

  if (!row || row.round.status === "ended") return;

  await db.update(rounds).set({ status: "ended" }).where(eq(rounds.id, roundId));

  const result = await buildRoundResult(row.round.id);
  await events.roundEnded?.(roomCode, result);
  await events.leaderboardUpdated?.(roomCode);
  await events.roomState?.(roomCode);

  clearNextRoundTimer(row.game.id);
  nextRoundTimers.set(
    row.game.id,
    setTimeout(() => {
      void startNextRoundOrEndGame(roomCode, row.game.id, row.round.roundNumber);
    }, env.ROUND_RESULT_DELAY_MS)
  );
}

async function startNextRoundOrEndGame(roomCode: string, gameId: string, completedRoundNumber: number) {
  clearNextRoundTimer(gameId);

  const [next] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.gameId, gameId), eq(rounds.roundNumber, completedRoundNumber + 1)))
    .limit(1);

  if (!next) {
    await endGame(roomCode, gameId);
    return;
  }

  await startRound(roomCode, gameId, completedRoundNumber + 1);
}

async function endGame(roomCode: string, gameId: string) {
  const room = await getRoomByCode(roomCode);
  await db.update(games).set({ status: "ended", endedAt: new Date() }).where(eq(games.id, gameId));
  await db.update(rooms).set({ status: "ended", updatedAt: new Date() }).where(eq(rooms.id, room.id));
  await events.gameEnded?.(roomCode);
  await events.roomState?.(roomCode);
}

async function buildRoundResult(roundId: string): Promise<RoundResultState> {
  const [row] = await db
    .select({ round: rounds, track: tracks, game: games })
    .from(rounds)
    .innerJoin(tracks, eq(tracks.id, rounds.trackId))
    .innerJoin(games, eq(games.id, rounds.gameId))
    .where(eq(rounds.id, roundId));

  if (!row) throw new AppError("ROUND_NOT_ACTIVE", "Round not found", 404);

  const answerRows = await db.select().from(answers).where(eq(answers.roundId, roundId));
  const roomPlayerRows = await db.select().from(roomPlayers).where(eq(roomPlayers.roomId, row.game.roomId));

  return {
    roundId,
    correctOptionId: row.round.correctOptionId,
    correctTitle: row.track.title,
    correctArtist: row.track.artist,
    album: row.track.album ?? undefined,
    artworkUrl: row.track.artworkUrl ?? undefined,
    playerResults: roomPlayerRows.map((player) => {
      const answer = answerRows.find((candidate) => candidate.playerId === player.playerId);
      return {
        playerId: player.playerId,
        selectedOptionId: answer?.selectedOptionId,
        isCorrect: answer?.isCorrect ?? false,
        answeredAt: answer?.answeredAt.toISOString(),
        score: answer?.score ?? 0
      };
    })
  };
}

async function hasEveryConnectedPlayerAnswered(roomId: string, roundId: string) {
  const connectedPlayers = await db
    .select({ playerId: roomPlayers.playerId })
    .from(roomPlayers)
    .where(and(eq(roomPlayers.roomId, roomId), eq(roomPlayers.isConnected, true)));

  if (connectedPlayers.length === 0) return false;

  const answerRows = await db
    .select({ playerId: answers.playerId })
    .from(answers)
    .where(eq(answers.roundId, roundId));
  const answeredPlayerIds = new Set(answerRows.map((answer) => answer.playerId));

  return connectedPlayers.every((player) => answeredPlayerIds.has(player.playerId));
}

async function getActiveGame(roomId: string) {
  const [game] = await db
    .select()
    .from(games)
    .where(and(eq(games.roomId, roomId), eq(games.status, "active")))
    .orderBy(asc(games.createdAt))
    .limit(1);

  if (!game) {
    throw new AppError("ROUND_NOT_ACTIVE", "No active game", 409);
  }

  return game;
}

function pickQuestionType(mode: GameSettings["questionMode"]): QuestionType {
  if (mode === "mixed") {
    return Math.random() > 0.5 ? "guess_song" : "guess_artist";
  }
  return mode;
}

function toOptionTrack(track: StoredTrack) {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    genre: track.genre,
    releaseYear: track.releaseYear,
    popularity: track.popularity
  };
}

function getTargetTracksCount(settings: GameSettings) {
  return Math.max(settings.roundsCount + 12, settings.roundsCount * 4);
}

async function emitPreparing(
  roomCode: string,
  settings: GameSettings,
  targetTracks: number,
  state: Omit<GamePreparingState, "roomCode" | "requestedRounds" | "targetTracks">
) {
  await events.gamePreparing?.(roomCode, {
    roomCode,
    requestedRounds: settings.roundsCount,
    targetTracks,
    ...state
  });
}

function clearRoundTimer(roundId: string) {
  const timer = roundTimers.get(roundId);
  if (timer) clearTimeout(timer);
  roundTimers.delete(roundId);
}

function clearNextRoundTimer(gameId: string) {
  const timer = nextRoundTimers.get(gameId);
  if (timer) clearTimeout(timer);
  nextRoundTimers.delete(gameId);
}
