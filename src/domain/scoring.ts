export const MAX_SCORE = 1000;
export const MIN_SCORE = 300;

export function calculateScore(params: {
  isCorrect: boolean;
  answeredAtMs: number;
  roundStartedAtMs: number;
  roundDurationMs: number;
}) {
  if (!params.isCorrect) return 0;

  const elapsedMs = params.answeredAtMs - params.roundStartedAtMs;
  if (elapsedMs < 0) return 0;
  if (elapsedMs > params.roundDurationMs) return 0;

  const progress = elapsedMs / params.roundDurationMs;
  const score = MAX_SCORE - progress * (MAX_SCORE - MIN_SCORE);
  return Math.round(score);
}
