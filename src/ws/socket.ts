import { Server } from "socket.io";
import type { Socket } from "socket.io";
import { ZodError } from "zod";
import { toErrorResponse } from "../domain/errors.js";
import {
  socketAnswerSchema,
  socketJoinSchema,
  socketNextRoundSchema,
  socketStartSchema,
  socketUpdateNameSchema
} from "../domain/validation.js";
import { redis } from "../redis/client.js";
import { configureGameEvents, getLeaderboard, nextRound, startGame, submitAnswer } from "../services/game-service.js";
import { getPublicRoomState, markPlayerConnected, updatePlayerName } from "../services/room-service.js";

type SocketData = {
  roomCode?: string;
  playerId?: string;
};

type MusicQuizSocket = Socket<SocketClientEvents, SocketServerEvents, never, SocketData>;

export function attachSocketServer(httpServer: ConstructorParameters<typeof Server>[0]) {
  const io = new Server<SocketClientEvents, SocketServerEvents, never, SocketData>(httpServer, {
    cors: {
      origin: true,
      credentials: true
    }
  });

  configureGameEvents({
    roomState: async (roomCode) => {
      io.to(roomCode).emit("room:state", await getPublicRoomState(roomCode));
    },
    gamePreparing: async (roomCode, state) => {
      io.to(roomCode).emit("game:preparing", state);
    },
    gameStarted: async (roomCode) => {
      io.to(roomCode).emit("game:started", await getPublicRoomState(roomCode));
    },
    roundStarted: async (roomCode, state) => {
      io.to(roomCode).emit("round:started", state);
    },
    roundEnded: async (roomCode, result) => {
      io.to(roomCode).emit("round:ended", result);
    },
    leaderboardUpdated: async (roomCode) => {
      io.to(roomCode).emit("leaderboard:updated", await getLeaderboard(roomCode));
    },
    gameEnded: async (roomCode) => {
      io.to(roomCode).emit("game:ended", await getPublicRoomState(roomCode));
    }
  });

  io.on("connection", (socket) => {
    socket.on("room:join", async (payload) => {
      await handleSocket(socket, async () => {
        const data = socketJoinSchema.parse(payload);
        socket.data.roomCode = data.roomCode;
        socket.data.playerId = data.playerId;
        await socket.join(data.roomCode);
        await redis.set(`presence:socket:${socket.id}`, JSON.stringify(data), "EX", 3600);
        const state = await markPlayerConnected(data.roomCode, data.playerId, true);
        socket.emit("room:state", state);
        socket.to(data.roomCode).emit("player:joined", { playerId: data.playerId });
        socket.to(data.roomCode).emit("room:state", state);
      });
    });

    socket.on("room:leave", async () => {
      await handleSocket(socket, async () => {
        await leaveSocketRoom(socket, io);
      });
    });

    socket.on("game:start", async (payload) => {
      await handleSocket(socket, async () => {
        const data = socketStartSchema.parse(payload);
        await startGame(data.roomCode, data.playerId, data.settings);
      });
    });

    socket.on("round:answer", async (payload) => {
      await handleSocket(socket, async () => {
        const data = socketAnswerSchema.parse(payload);
        const result = await submitAnswer(data);
        socket.emit("answer:submitted", result);
      });
    });

    socket.on("round:next", async (payload) => {
      await handleSocket(socket, async () => {
        const data = socketNextRoundSchema.parse(payload);
        await nextRound(data.roomCode, data.playerId);
      });
    });

    socket.on("player:updateName", async (payload) => {
      await handleSocket(socket, async () => {
        const data = socketUpdateNameSchema.parse(payload);
        const state = await updatePlayerName(data.roomCode, data.playerId, data.nickname);
        io.to(data.roomCode).emit("room:state", state);
      });
    });

    socket.on("disconnect", async () => {
      await leaveSocketRoom(socket, io).catch(() => undefined);
    });
  });

  return io;
}

async function leaveSocketRoom(
  socket: MusicQuizSocket,
  io: Server<SocketClientEvents, SocketServerEvents, never, SocketData>
) {
  const roomCode = socket.data.roomCode;
  const playerId = socket.data.playerId;
  if (!roomCode || !playerId) return;

  const state = await markPlayerConnected(roomCode, playerId, false);
  await socket.leave(roomCode);
  await redis.del(`presence:socket:${socket.id}`);
  socket.to(roomCode).emit("player:left", { playerId });
  io.to(roomCode).emit("room:state", state);
}

async function handleSocket(socket: MusicQuizSocket, action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    if (error instanceof ZodError) {
      socket.emit("error", {
        error: {
          code: "BAD_REQUEST",
          message: "Invalid socket payload",
          issues: error.issues
        }
      });
      return;
    }

    console.error("[socket:error]", error);
    socket.emit("error", toErrorResponse(error).body);
  }
}

type SocketClientEvents = {
  "room:join": (payload: unknown) => void;
  "room:leave": () => void;
  "game:start": (payload: unknown) => void;
  "round:answer": (payload: unknown) => void;
  "round:next": (payload: unknown) => void;
  "player:updateName": (payload: unknown) => void;
};

type SocketServerEvents = {
  "room:state": (payload: unknown) => void;
  "player:joined": (payload: { playerId: string }) => void;
  "player:left": (payload: { playerId: string }) => void;
  "game:preparing": (payload: unknown) => void;
  "game:started": (payload: unknown) => void;
  "round:started": (payload: unknown) => void;
  "answer:submitted": (payload: unknown) => void;
  "round:ended": (payload: unknown) => void;
  "leaderboard:updated": (payload: unknown) => void;
  "game:ended": (payload: unknown) => void;
  error: (payload: unknown) => void;
};
