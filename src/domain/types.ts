import type { GenerationFilters } from "./generation-options.js";

export const ROOM_STATUSES = ["lobby", "in_game", "ended"] as const;
export const GAME_STATUSES = ["pending", "active", "ended"] as const;
export const ROUND_STATUSES = ["pending", "active", "ended"] as const;
export const QUESTION_TYPES = ["guess_song", "guess_artist"] as const;
export const QUESTION_MODES = ["guess_song", "guess_artist", "mixed"] as const;
export const ROUND_DURATIONS = [5, 10, 15] as const;
export const ROUNDS_COUNTS = [5, 10, 15] as const;
export const SOURCE_TYPES = ["spotify_playlist", "artist", "genre", "random", "deezer_playlist", "deezer_chart", "lastfm_tag", "lastfm_geo", "lastfm_chart"] as const;
export const SOURCE_PROVIDERS = ["spotify", "deezer", "lastfm"] as const;

export type RoomStatus = (typeof ROOM_STATUSES)[number];
export type GameStatus = (typeof GAME_STATUSES)[number];
export type RoundStatus = (typeof ROUND_STATUSES)[number];
export type QuestionType = (typeof QUESTION_TYPES)[number];
export type QuestionMode = (typeof QUESTION_MODES)[number];
export type RoundDurationSec = (typeof ROUND_DURATIONS)[number];
export type RoundsCount = (typeof ROUNDS_COUNTS)[number];
export type SourceType = (typeof SOURCE_TYPES)[number];
export type SourceProvider = (typeof SOURCE_PROVIDERS)[number];

export type AnswerOption = {
  id: string;
  label: string;
};

export type GameSettings = {
  roundsCount: RoundsCount;
  roundDurationSec: RoundDurationSec;
  questionMode: QuestionMode;
  answerOptionsCount: 4;
  source: {
    provider?: SourceProvider;
    type: SourceType;
    value?: string;
    market?: string;
    filters?: GenerationFilters;
  };
};

export type GamePreparingPhase = "queued" | "spotify_search" | "preview_matching" | "building_rounds" | "ready" | "failed";

export type GamePreparingState = {
  roomCode: string;
  phase: GamePreparingPhase;
  message: string;
  requestedRounds: number;
  targetTracks: number;
  foundSourceTracks?: number;
  matchedTracks?: number;
  rejectedTracks?: number;
};

export type PublicRoundState = {
  roundId: string;
  roundNumber: number;
  questionType: QuestionType;
  questionText: string;
  previewUrl: string;
  artworkUrl?: string;
  options: AnswerOption[];
  roundStartedAt: string;
  roundEndsAt: string;
  durationSec: RoundDurationSec;
};

export type RoundResultState = {
  roundId: string;
  correctOptionId: string;
  correctTitle: string;
  correctArtist: string;
  album?: string;
  artworkUrl?: string;
  playerResults: {
    playerId: string;
    selectedOptionId?: string;
    isCorrect: boolean;
    answeredAt?: string;
    score: number;
  }[];
};

export type PublicPlayerState = {
  id: string;
  nickname: string;
  score: number;
  isHost: boolean;
  isConnected: boolean;
};

export type PublicRoomState = {
  id: string;
  code: string;
  status: RoomStatus;
  hostPlayerId: string;
  settings: GameSettings;
  players: PublicPlayerState[];
  currentRound?: PublicRoundState;
};
