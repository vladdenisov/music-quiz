import { describe, expect, it } from "vitest";
import { calculateScore } from "../domain/scoring.js";

describe("calculateScore", () => {
  it("scales score from 1000 to 300 for a 10 second round", () => {
    const started = 1_000;
    const duration = 10_000;

    expect(scoreAt(started, duration, 0)).toBe(1000);
    expect(scoreAt(started, duration, 2_000)).toBe(860);
    expect(scoreAt(started, duration, 5_000)).toBe(650);
    expect(scoreAt(started, duration, 8_000)).toBe(440);
    expect(scoreAt(started, duration, 10_000)).toBe(300);
  });

  it("scales score from 1000 to 300 for a 5 second round", () => {
    const started = 1_000;
    const duration = 5_000;

    expect(scoreAt(started, duration, 0)).toBe(1000);
    expect(scoreAt(started, duration, 1_000)).toBe(860);
    expect(scoreAt(started, duration, 2_500)).toBe(650);
    expect(scoreAt(started, duration, 4_000)).toBe(440);
    expect(scoreAt(started, duration, 5_000)).toBe(300);
  });

  it("returns zero for wrong, early, and late answers", () => {
    expect(
      calculateScore({
        isCorrect: false,
        answeredAtMs: 1_000,
        roundStartedAtMs: 1_000,
        roundDurationMs: 10_000
      })
    ).toBe(0);

    expect(scoreAt(1_000, 10_000, -1)).toBe(0);
    expect(scoreAt(1_000, 10_000, 10_001)).toBe(0);
  });
});

function scoreAt(started: number, duration: number, elapsed: number) {
  return calculateScore({
    isCorrect: true,
    answeredAtMs: started + elapsed,
    roundStartedAtMs: started,
    roundDurationMs: duration
  });
}
