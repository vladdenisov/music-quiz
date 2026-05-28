import { describe, expect, it } from "vitest";
import { buildAnswerOptions } from "../domain/distractors.js";
import { AppError } from "../domain/errors.js";

describe("buildAnswerOptions", () => {
  it("builds exactly four song options without isCorrect", () => {
    const result = buildAnswerOptions({
      questionType: "guess_song",
      correctTrack: track("1", "Toxic", "Britney Spears", 2003, 90),
      candidateTracks: [
        track("2", "Hung Up", "Madonna", 2005, 88),
        track("3", "Maneater", "Nelly Furtado", 2006, 85),
        track("4", "Don't Cha", "The Pussycat Dolls", 2005, 84),
        track("5", "Für Elise", "Beethoven", 1810, 50)
      ]
    });

    expect(result.options).toHaveLength(4);
    expect(result.options.some((option) => option.label === "Toxic")).toBe(true);
    expect(result.options.every((option) => !("isCorrect" in option))).toBe(true);
  });

  it("fails when there are not enough relevant distractors", () => {
    expect(() =>
      buildAnswerOptions({
        questionType: "guess_artist",
        correctTrack: track("1", "Levitating", "Dua Lipa", 2020, 90),
        candidateTracks: [track("2", "Song", "Dua Lipa", 2020, 90)]
      })
    ).toThrow(AppError);
  });
});

function track(id: string, title: string, artist: string, releaseYear: number, popularity: number) {
  return {
    id,
    title,
    artist,
    genre: "pop",
    releaseYear,
    popularity
  };
}
