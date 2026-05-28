import { hasUnwantedVersionMismatch, normalizeMusicText, tokenSimilarity } from "./normalize.js";

export type SourceTrackForMatch = {
  sourceTrackId: string;
  title: string;
  artist: string;
  album?: string | null;
  durationMs?: number | null;
  isrc?: string | null;
};

export type PreviewCandidate = {
  provider: "itunes" | "deezer";
  providerTrackId: string;
  title: string;
  artist: string;
  album?: string | null;
  durationMs?: number | null;
  previewUrl?: string | null;
  artworkUrl?: string | null;
  metadata: Record<string, unknown>;
};

export type MatchScoreResult = {
  score: number;
  reasons: string[];
};

export const ACCEPT_MATCH_THRESHOLD = 75;

export function scorePreviewCandidate(source: SourceTrackForMatch, candidate: PreviewCandidate): MatchScoreResult {
  let score = 0;
  const reasons: string[] = [];

  const titleScore = tokenSimilarity(source.title, candidate.title);
  if (titleScore >= 0.9) {
    score += 50;
    reasons.push("title_exact_or_near");
  } else if (titleScore >= 0.65) {
    score += 30;
    reasons.push("title_partial");
  }

  const artistScore = artistSimilarity(source.artist, candidate.artist);
  if (artistScore >= 0.9) {
    score += 30;
    reasons.push("artist_exact_or_near");
  } else if (artistScore >= 0.65) {
    score += 15;
    reasons.push("artist_partial");
  }

  if (source.album && candidate.album && tokenSimilarity(source.album, candidate.album) >= 0.8) {
    score += 10;
    reasons.push("album_match");
  }

  if (source.durationMs && candidate.durationMs) {
    const diffMs = Math.abs(source.durationMs - candidate.durationMs);
    if (diffMs <= 5000) {
      score += 10;
      reasons.push("duration_close");
    }
  }

  if (hasUnwantedVersionMismatch(source.title, candidate.title) && !hasCreditedVersionArtist(source.artist, candidate.title)) {
    score -= 30;
    reasons.push("unwanted_version_mismatch");
  }

  if (!candidate.previewUrl) {
    score -= 100;
    reasons.push("missing_preview");
  }

  return { score, reasons };
}

export function selectBestPreviewMatch(source: SourceTrackForMatch, candidates: PreviewCandidate[]) {
  return candidates
    .map((candidate) => ({ candidate, result: scorePreviewCandidate(source, candidate) }))
    .sort((left, right) => right.result.score - left.result.score)[0];
}

function artistSimilarity(sourceArtist: string, candidateArtist: string) {
  const sourceArtists = splitArtistCredit(sourceArtist);
  const candidateArtists = splitArtistCredit(candidateArtist);
  let bestScore = tokenSimilarity(sourceArtist, candidateArtist);

  for (const source of sourceArtists) {
    for (const candidate of candidateArtists) {
      bestScore = Math.max(bestScore, tokenSimilarity(source, candidate));
    }
  }

  return bestScore;
}

function splitArtistCredit(value: string) {
  return value
    .split(/\s*,\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function hasCreditedVersionArtist(sourceArtist: string, candidateTitle: string) {
  const candidateTitleNormalized = normalizeArtistCreditSearch(candidateTitle);
  return splitArtistCredit(sourceArtist)
    .slice(1)
    .some((artist) => {
      const artistNormalized = normalizeArtistCreditSearch(artist);
      return artistNormalized && candidateTitleNormalized.includes(artistNormalized);
    });
}

function normalizeArtistCreditSearch(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
