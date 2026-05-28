import { randomInt } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { games, players, roomPlayers, rooms, rounds, tracks } from "../db/schema.js";
import { AppError } from "../domain/errors.js";
import type { GameSettings, PublicRoomState, PublicRoundState } from "../domain/types.js";
import { createRoomSchema, defaultGameSettings, gameSettingsSchema } from "../domain/validation.js";
import { assertRateLimit } from "../redis/rate-limit.js";

export async function createRoom(input: unknown, ip = "unknown") {
  await assertRateLimit({ key: `rate:create-room:${ip}`, limit: 10, windowSec: 60 });
  const parsed = createRoomSchema.parse(input);
  const settings = gameSettingsSchema.parse({ ...defaultGameSettings, ...parsed.settings });

  const [player] = await db.insert(players).values({ nickname: parsed.nickname }).returning();
  if (!player) throw new AppError("BAD_REQUEST", "Could not create player", 500);

  const room = await createRoomWithUniqueCode(player.id, settings);

  await db.insert(roomPlayers).values({
    roomId: room.id,
    playerId: player.id,
    isConnected: true
  });

  return {
    roomCode: room.code,
    roomId: room.id,
    playerId: player.id,
    isHost: true,
    state: await getPublicRoomState(room.code)
  };
}

export async function joinRoom(roomCode: string, input: { nickname: string }, ip = "unknown") {
  await assertRateLimit({ key: `rate:join-room:${roomCode}:${ip}`, limit: 20, windowSec: 60 });

  const room = await getRoomByCode(roomCode);
  if (room.status !== "lobby") {
    throw new AppError("GAME_ALREADY_STARTED", "Game already started", 409);
  }

  const [player] = await db.insert(players).values({ nickname: input.nickname }).returning();
  if (!player) throw new AppError("BAD_REQUEST", "Could not create player", 500);

  await db.insert(roomPlayers).values({
    roomId: room.id,
    playerId: player.id,
    isConnected: true
  });

  return {
    roomCode: room.code,
    roomId: room.id,
    playerId: player.id,
    isHost: room.hostPlayerId === player.id,
    state: await getPublicRoomState(room.code)
  };
}

export async function markPlayerConnected(roomCode: string, playerId: string, isConnected: boolean) {
  const room = await getRoomByCode(roomCode);
  await assertPlayerInRoom(room.id, playerId);
  await db
    .update(roomPlayers)
    .set({ isConnected, leftAt: isConnected ? null : new Date() })
    .where(and(eq(roomPlayers.roomId, room.id), eq(roomPlayers.playerId, playerId)));
  return getPublicRoomState(roomCode);
}

export async function updatePlayerName(roomCode: string, playerId: string, nickname: string) {
  const room = await getRoomByCode(roomCode);
  await assertPlayerInRoom(room.id, playerId);
  await db.update(players).set({ nickname }).where(eq(players.id, playerId));
  return getPublicRoomState(roomCode);
}

export async function getPublicRoomState(roomCode: string): Promise<PublicRoomState> {
  const room = await getRoomByCode(roomCode);

  const roomPlayerRows = await db
    .select({
      playerId: players.id,
      nickname: players.nickname,
      score: roomPlayers.score,
      isConnected: roomPlayers.isConnected
    })
    .from(roomPlayers)
    .innerJoin(players, eq(players.id, roomPlayers.playerId))
    .where(eq(roomPlayers.roomId, room.id));

  const currentRound = await getCurrentPublicRound(room.id);

  return {
    id: room.id,
    code: room.code,
    status: room.status,
    hostPlayerId: room.hostPlayerId,
    settings: room.settings,
    players: roomPlayerRows.map((row) => ({
      id: row.playerId,
      nickname: row.nickname,
      score: row.score,
      isHost: row.playerId === room.hostPlayerId,
      isConnected: row.isConnected
    })),
    currentRound
  };
}

export async function getRoomByCode(roomCode: string) {
  const [room] = await db.select().from(rooms).where(eq(rooms.code, roomCode.toUpperCase()));
  if (!room) {
    throw new AppError("ROOM_NOT_FOUND", "Room not found", 404);
  }
  return room;
}

export async function assertPlayerInRoom(roomId: string, playerId: string) {
  const [membership] = await db
    .select()
    .from(roomPlayers)
    .where(and(eq(roomPlayers.roomId, roomId), eq(roomPlayers.playerId, playerId)));

  if (!membership) {
    throw new AppError("PLAYER_NOT_IN_ROOM", "Player is not in this room", 403);
  }

  return membership;
}

async function createRoomWithUniqueCode(hostPlayerId: string, settings: GameSettings) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateRoomCode();
    const [room] = await db
      .insert(rooms)
      .values({ code, hostPlayerId, settings })
      .onConflictDoNothing()
      .returning();

    if (room) return room;
  }

  throw new AppError("BAD_REQUEST", "Could not allocate room code", 500);
}

async function getCurrentPublicRound(roomId: string): Promise<PublicRoundState | undefined> {
  const [row] = await db
    .select({
      round: rounds,
      track: tracks
    })
    .from(games)
    .innerJoin(rounds, eq(rounds.gameId, games.id))
    .innerJoin(tracks, eq(tracks.id, rounds.trackId))
    .where(and(eq(games.roomId, roomId), eq(games.status, "active"), eq(rounds.status, "active")))
    .orderBy(desc(rounds.roundNumber))
    .limit(1);

  if (!row?.round.roundStartedAt || !row.round.roundEndsAt) return undefined;

  return {
    roundId: row.round.id,
    roundNumber: row.round.roundNumber,
    questionType: row.round.questionType,
    questionText: row.round.questionText,
    previewUrl: row.track.previewUrl,
    artworkUrl: row.track.artworkUrl ?? undefined,
    options: row.round.options,
    roundStartedAt: row.round.roundStartedAt.toISOString(),
    roundEndsAt: row.round.roundEndsAt.toISOString(),
    durationSec: row.round.roundDurationSec as PublicRoundState["durationSec"]
  };
}

function generateRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[randomInt(alphabet.length)];
  }
  return code;
}
