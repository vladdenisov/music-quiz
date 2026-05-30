export type AppErrorCode =
  | "BAD_REQUEST"
  | "ROOM_NOT_FOUND"
  | "GAME_ALREADY_STARTED"
  | "HOST_ONLY"
  | "INVALID_SETTINGS"
  | "NOT_ENOUGH_TRACK_CANDIDATES"
  | "PLAYER_NOT_IN_ROOM"
  | "ROUND_NOT_ACTIVE"
  | "ANSWER_ALREADY_SUBMITTED"
  | "ANSWER_TOO_LATE"
  | "OPTION_NOT_FOUND"
  | "RATE_LIMITED"
  | "TRACK_PREVIEW_UNAVAILABLE"
  | "TRACK_NOT_FOUND";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;

  constructor(code: AppErrorCode, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function toErrorResponse(error: unknown) {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: { error: { code: error.code, message: error.message } }
    };
  }

  return {
    status: 500,
    body: { error: { code: "INTERNAL_ERROR", message: "Internal server error" } }
  };
}
