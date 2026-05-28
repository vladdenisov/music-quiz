import { randomInt } from "node:crypto";
import { AppError } from "./errors.js";
import { normalizeMusicText, sameNormalizedValue } from "./normalize.js";
import type { AnswerOption, QuestionType } from "./types.js";

export type TrackForOptions = {
  id: string;
  title: string;
  artist: string;
  genre?: string | null;
  releaseYear?: number | null;
  popularity?: number | null;
};

export type BuiltOptions = {
  options: AnswerOption[];
  correctOptionId: string;
  correctAnswer: string;
};

export function buildAnswerOptions(params: {
  questionType: QuestionType;
  correctTrack: TrackForOptions;
  candidateTracks: TrackForOptions[];
  excludeLabels?: Set<string>;
}): BuiltOptions {
  const correctLabel = params.questionType === "guess_song" ? params.correctTrack.title : params.correctTrack.artist;
  const distractors = pickDistractors(params.questionType, params.correctTrack, params.candidateTracks, 3, params.excludeLabels);

  const options = shuffle([
    { id: "a", label: correctLabel },
    ...distractors.map((track, index) => ({
      id: String.fromCharCode("b".charCodeAt(0) + index),
      label: params.questionType === "guess_song" ? track.title : track.artist
    }))
  ]).map((option, index) => ({ ...option, id: String.fromCharCode("a".charCodeAt(0) + index) }));

  const correctOption = options.find((option) => sameNormalizedValue(option.label, correctLabel));
  if (!correctOption) {
    throw new AppError("NOT_ENOUGH_TRACK_CANDIDATES", "Could not build correct answer option", 422);
  }

  return {
    options,
    correctOptionId: correctOption.id,
    correctAnswer: correctLabel
  };
}

export function pickDistractors(
  questionType: QuestionType,
  correctTrack: TrackForOptions,
  candidateTracks: TrackForOptions[],
  count: number,
  excludeLabels?: Set<string>
) {
  const correctValue = questionType === "guess_song" ? correctTrack.title : correctTrack.artist;
  const seen = new Set([normalizeMusicText(correctValue)]);
  const excluded = excludeLabels ?? new Set<string>();

  const ranked = candidateTracks
    .filter((track) => track.id !== correctTrack.id)
    .filter((track) => track.title.trim() && track.artist.trim())
    .filter((track) => !isUnwantedDistractor(track.title))
    .filter((track) => {
      const value = questionType === "guess_song" ? track.title : track.artist;
      const normalized = normalizeMusicText(value);
      if (!normalized || seen.has(normalized) || excluded.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .map((track) => ({ track, score: contextScore(correctTrack, track) }))
    .sort((left, right) => right.score - left.score)
    .map(({ track }) => track);

  if (ranked.length < count) {
    throw new AppError("NOT_ENOUGH_TRACK_CANDIDATES", "Not enough relevant distractors", 422);
  }

  const poolSize = Math.min(ranked.length, Math.max(count * 4, 12));
  return shuffle(ranked.slice(0, poolSize)).slice(0, count);
}

function contextScore(correct: TrackForOptions, candidate: TrackForOptions) {
  let score = 0;

  if (correct.genre && candidate.genre && normalizeMusicText(correct.genre) === normalizeMusicText(candidate.genre)) {
    score += 40;
  }

  if (correct.releaseYear && candidate.releaseYear) {
    const yearDiff = Math.abs(correct.releaseYear - candidate.releaseYear);
    if (yearDiff <= 3) score += 25;
    else if (yearDiff <= 8) score += 15;
  }

  if (correct.popularity != null && candidate.popularity != null) {
    const popularityDiff = Math.abs(correct.popularity - candidate.popularity);
    if (popularityDiff <= 10) score += 25;
    else if (popularityDiff <= 25) score += 10;
  }

  return score;
}

function isUnwantedDistractor(title: string) {
  const normalized = normalizeMusicText(title);
  return ["karaoke", "cover", "sped up", "slowed", "nightcore"].some((marker) => normalized.includes(marker));
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [copy[index], copy[swapIndex]] = [copy[swapIndex]!, copy[index]!];
  }
  return copy;
}
