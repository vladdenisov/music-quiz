import { describe, expect, it } from "vitest";
import {
  buildSpotifySearchQueries,
  buildSpotifySearchQuery,
  getRandomSpotifySearchOffsets,
  getSpotifySearchLimit,
  getSpotifySearchOffsets
} from "../integrations/spotify.js";

describe("spotify generation helpers", () => {
  it("uses Spotify search pagination with doc-safe per-request limit", () => {
    expect(getSpotifySearchLimit(40)).toBe(10);
    expect(getSpotifySearchLimit(5)).toBe(10);
    expect(getSpotifySearchOffsets()).toEqual([0, 10, 20, 30, 40]);
  });

  it("builds a Russian rock decade query", () => {
    expect(
      buildSpotifySearchQuery({
        roundsCount: 10,
        roundDurationSec: 10,
        questionMode: "mixed",
        answerOptionsCount: 4,
        source: {
          type: "random",
          market: "US",
          filters: {
            language: "russian",
            decades: ["1980s"],
            genres: ["rus_rock"]
          }
        }
      })
    ).toBe("русский рок year:1980-1989 русский");
  });

  it("adds Russian-language fallback terms for Russian rock", () => {
    const queries = buildSpotifySearchQueries({
      roundsCount: 10,
      roundDurationSec: 10,
      questionMode: "mixed",
      answerOptionsCount: 4,
      source: {
        type: "random",
        market: "US",
        filters: {
          language: "russian",
          decades: ["1990s"],
          genres: ["rus_rock"]
        }
      }
    });

    expect(queries).toContain("russian rock year:1990-1999 россия");
    expect(queries).toContain("russian rock year:1990-1999 russian");
    expect(queries).toContain("russian rock year:1990-1999");
  });

  it("builds broader fallback queries for strict Spotify genre searches", () => {
    const queries = buildSpotifySearchQueries({
      roundsCount: 10,
      roundDurationSec: 10,
      questionMode: "mixed",
      answerOptionsCount: 4,
      source: {
        type: "random",
        market: "US",
        filters: {
          decades: ["1970s"],
          genres: ["disco"]
        }
      }
    });

    expect(queries).toContain("genre:disco year:1970-1979");
    expect(queries).toContain("disco year:1970-1979");
    expect(queries).toContain("year:1970-1979");
  });

  it("keeps a safe first search page while sampling later pages randomly", () => {
    const offsets = getRandomSpotifySearchOffsets();

    expect(offsets).toHaveLength(5);
    expect(offsets[0]).toBe(0);
    expect(new Set(offsets).size).toBe(offsets.length);
    expect(offsets.every((offset) => offset % 10 === 0)).toBe(true);
    expect(offsets.slice(1).every((offset) => offset >= 10 && offset <= 200)).toBe(true);
  });
});
