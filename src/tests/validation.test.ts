import { describe, expect, it } from "vitest";
import { gameSettingsSchema } from "../domain/validation.js";

describe("gameSettingsSchema", () => {
  it("accepts MVP settings", () => {
    expect(() =>
      gameSettingsSchema.parse({
        roundsCount: 10,
        roundDurationSec: 10,
        questionMode: "mixed",
        answerOptionsCount: 4,
        source: {
          type: "random",
          market: "US"
        }
      })
    ).not.toThrow();
  });

  it("accepts generation filters for language, decades, genres, and mood", () => {
    expect(() =>
      gameSettingsSchema.parse({
        roundsCount: 15,
        roundDurationSec: 5,
        questionMode: "guess_song",
        answerOptionsCount: 4,
        source: {
          type: "random",
          market: "US",
          filters: {
            language: "russian",
            decades: ["1980s", "1990s"],
            genres: ["rus_rock", "rus_pop"],
            moods: ["nostalgic", "karaoke"],
            popularity: "popular",
            difficulty: "medium",
            explicitness: "clean",
            region: "RU"
          }
        }
      })
    ).not.toThrow();
  });

  it("rejects unsupported options count and duration", () => {
    expect(() =>
      gameSettingsSchema.parse({
        roundsCount: 10,
        roundDurationSec: 20,
        questionMode: "mixed",
        answerOptionsCount: 5,
        source: {
          type: "random",
          market: "US"
        }
      })
    ).toThrow();
  });

  it("rejects unknown generation filters", () => {
    expect(() =>
      gameSettingsSchema.parse({
        roundsCount: 10,
        roundDurationSec: 10,
        questionMode: "mixed",
        answerOptionsCount: 4,
        source: {
          type: "random",
          market: "US",
          filters: {
            language: "gibberish"
          }
        }
      })
    ).toThrow();
  });
});
