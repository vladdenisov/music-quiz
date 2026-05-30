import { and, asc, eq, gte, inArray, lte, ne, or, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { rejectedTrackMatches, trackMatches, tracks } from "../db/schema.js";
import { AppError } from "../domain/errors.js";
import {
  ACCEPT_MATCH_THRESHOLD,
  scorePreviewCandidate,
  selectBestPreviewMatch,
  type PreviewCandidate,
  type SourceTrackForMatch
} from "../domain/matching.js";
import { isPreviewUrlReachable } from "../domain/preview-url.js";
import type { GamePreparingState, GameSettings } from "../domain/types.js";
import { searchDeezerPreviewCandidates } from "../integrations/deezer.js";
import { generateDeezerTracks } from "../integrations/deezer-source.js";
import { searchItunesPreviewCandidates } from "../integrations/itunes.js";
import { generateLastfmTracks } from "../integrations/lastfm-source.js";
import type { GeneratedSourceTrack } from "../integrations/source-track.js";
import { generateSpotifyTracks } from "../integrations/spotify.js";

export type StoredTrack = typeof tracks.$inferSelect;

type TrackGenerationProgress = Omit<GamePreparingState, "roomCode" | "requestedRounds" | "targetTracks">;

type TrackGenerationOptions = {
  onProgress?: (progress: TrackGenerationProgress) => Promise<void>;
};

export async function generateTracksForGame(settings: GameSettings, options: TrackGenerationOptions = {}) {
  const minimumPoolSize = Math.max(settings.roundsCount + 12, settings.roundsCount * 4);
  await options.onProgress?.({
    phase: "spotify_search",
    message: "Ищем треки в Spotify"
  });

  const sourceTracks = await generateSourceTracks(settings, minimumPoolSize);
  const stored: StoredTrack[] = [];
  let rejectedTracks = 0;

  await options.onProgress?.({
    phase: "preview_matching",
    message: "Подбираем audio preview",
    foundSourceTracks: sourceTracks.length,
    matchedTracks: stored.length,
    rejectedTracks
  });

  console.debug("[tracks:generation:source]", {
    requestedMinimumPoolSize: minimumPoolSize,
    sourceTrackCount: sourceTracks.length,
    sourceTracks: sourceTracks.map((track) => summarizeSourceTrack(track))
  });

  for (const sourceTrack of sourceTracks) {
    const existing = await findExistingTrack(sourceTrack.source, sourceTrack.sourceTrackId);
    if (existing) {
      console.debug("[tracks:generation:cached-match]", {
        sourceTrack: summarizeSourceTrack(sourceTrack),
        storedTrack: summarizeStoredTrack(existing)
      });
      stored.push(existing);
      await options.onProgress?.({
        phase: "preview_matching",
        message: "Подбираем audio preview",
        foundSourceTracks: sourceTracks.length,
        matchedTracks: stored.length,
        rejectedTracks
      });
      continue;
    }

    if (sourceTrack.previewUrl) {
      const inserted = await insertSelfPreviewedTrack(sourceTrack);
      stored.push(inserted);
      await options.onProgress?.({
        phase: "preview_matching",
        message: "Подбираем audio preview",
        foundSourceTracks: sourceTracks.length,
        matchedTracks: stored.length,
        rejectedTracks
      });
      if (stored.length >= minimumPoolSize) break;
      continue;
    }

    const matched = await matchPreview(sourceTrack, settings.source.market ?? "US");
    if (!matched) {
      rejectedTracks += 1;
      await options.onProgress?.({
        phase: "preview_matching",
        message: "Подбираем audio preview",
        foundSourceTracks: sourceTracks.length,
        matchedTracks: stored.length,
        rejectedTracks
      });
      continue;
    }

    const inserted = await insertMatchedTrack(sourceTrack, matched.candidate, matched.score);
    console.debug("[tracks:generation:stored-match]", {
      sourceTrack: summarizeSourceTrack(sourceTrack),
      candidate: summarizeCandidate(matched.candidate),
      score: matched.score,
      storedTrack: summarizeStoredTrack(inserted)
    });
    stored.push(inserted);
    await options.onProgress?.({
      phase: "preview_matching",
      message: "Подбираем audio preview",
      foundSourceTracks: sourceTracks.length,
      matchedTracks: stored.length,
      rejectedTracks
    });

    if (stored.length >= minimumPoolSize) break;
  }

  if (stored.length < settings.roundsCount + 3) {
    console.warn("[tracks:generation:not-enough]", {
      requiredMinimum: settings.roundsCount + 3,
      storedCount: stored.length,
      sourceTrackCount: sourceTracks.length
    });
    throw new AppError("NOT_ENOUGH_TRACK_CANDIDATES", "Not enough tracks with reliable preview matches", 422);
  }

  return stored;
}

export async function getTrackById(id: string) {
  const [track] = await db.select().from(tracks).where(eq(tracks.id, id));
  if (!track) {
    throw new AppError("TRACK_NOT_FOUND", "Track not found", 404);
  }
  return track;
}

export async function getDistractorPool(correctTrack: StoredTrack, limit = 30) {
  const popularityMin = correctTrack.popularity == null ? 0 : Math.max(0, correctTrack.popularity - 25);
  const popularityMax = correctTrack.popularity == null ? 100 : Math.min(100, correctTrack.popularity + 25);
  const yearMin = correctTrack.releaseYear == null ? 1900 : correctTrack.releaseYear - 8;
  const yearMax = correctTrack.releaseYear == null ? 3000 : correctTrack.releaseYear + 8;
  const genreCondition =
    correctTrack.genre == null
      ? sql`${tracks.genre} is null`
      : or(eq(tracks.genre, correctTrack.genre), sql`${tracks.genre} is null`);

  return db
    .select()
    .from(tracks)
    .where(
      and(
        ne(tracks.id, correctTrack.id),
        genreCondition,
        or(sql`${tracks.releaseYear} is null`, and(gte(tracks.releaseYear, yearMin), lte(tracks.releaseYear, yearMax))),
        or(sql`${tracks.popularity} is null`, and(gte(tracks.popularity, popularityMin), lte(tracks.popularity, popularityMax)))
      )
    )
    .orderBy(asc(sql`random()`))
    .limit(limit);
}

export async function getTracksByIds(ids: string[]) {
  if (ids.length === 0) return [];
  return db.select().from(tracks).where(inArray(tracks.id, ids));
}

export async function ensureFreshPreview(track: StoredTrack, market = "US") {
  if (await isPreviewUrlReachable(track.previewUrl)) {
    return track;
  }

  const refreshed = await matchPreview(toSourceTrackForMatch(track), market);
  if (!refreshed) {
    throw new AppError("TRACK_PREVIEW_UNAVAILABLE", "Could not refresh expired track preview", 422);
  }

  const [updated] = await db
    .update(tracks)
    .set({
      previewUrl: refreshed.candidate.previewUrl!,
      previewProvider: refreshed.candidate.provider,
      artworkUrl: track.artworkUrl ?? refreshed.candidate.artworkUrl ?? null,
      matchScore: refreshed.score
    })
    .where(eq(tracks.id, track.id))
    .returning();

  if (!updated) {
    throw new AppError("TRACK_NOT_FOUND", "Could not update refreshed track preview", 500);
  }

  return updated;
}

async function generateSourceTracks(settings: GameSettings, minimumPoolSize: number) {
  const provider = settings.source.provider ?? "spotify";
  if (provider === "deezer") return generateDeezerTracks(settings, minimumPoolSize);
  if (provider === "lastfm") return generateLastfmTracks(settings, minimumPoolSize);
  return generateSpotifyTracks(settings, minimumPoolSize);
}

async function findExistingTrack(source: string, sourceTrackId: string) {
  const [track] = await db
    .select()
    .from(tracks)
    .where(and(eq(tracks.source, source), eq(tracks.sourceTrackId, sourceTrackId)));
  return track;
}

async function matchPreview(sourceTrack: SourceTrackForMatch, market: string) {
  const sourceForMatch: SourceTrackForMatch = {
    sourceTrackId: sourceTrack.sourceTrackId,
    title: sourceTrack.title,
    artist: sourceTrack.artist,
    album: sourceTrack.album,
    durationMs: sourceTrack.durationMs,
    isrc: sourceTrack.isrc
  };

  const itunesCandidates = await searchItunesPreviewCandidates(sourceForMatch, market);
  const itunesBest = selectBestPreviewMatch(sourceForMatch, itunesCandidates);
  logPreviewCandidates("itunes", sourceForMatch, itunesCandidates);

  await persistMatchScores(sourceForMatch, itunesCandidates);

  if (itunesBest && itunesBest.result.score >= ACCEPT_MATCH_THRESHOLD && itunesBest.candidate.previewUrl) {
    console.debug("[tracks:match:accepted]", {
      provider: "itunes",
      sourceTrack: sourceForMatch,
      candidate: summarizeCandidate(itunesBest.candidate),
      score: itunesBest.result.score,
      reasons: itunesBest.result.reasons
    });
    await persistAcceptedMatch(sourceForMatch, itunesBest.candidate, itunesBest.result.score);
    return { candidate: itunesBest.candidate, score: itunesBest.result.score };
  }

  const deezerCandidates = await searchDeezerPreviewCandidates(sourceForMatch);
  const deezerBest = selectBestPreviewMatch(sourceForMatch, deezerCandidates);
  logPreviewCandidates("deezer", sourceForMatch, deezerCandidates);

  await persistMatchScores(sourceForMatch, deezerCandidates);

  if (deezerBest && deezerBest.result.score >= ACCEPT_MATCH_THRESHOLD && deezerBest.candidate.previewUrl) {
    console.debug("[tracks:match:accepted]", {
      provider: "deezer",
      sourceTrack: sourceForMatch,
      candidate: summarizeCandidate(deezerBest.candidate),
      score: deezerBest.result.score,
      reasons: deezerBest.result.reasons
    });
    await persistAcceptedMatch(sourceForMatch, deezerBest.candidate, deezerBest.result.score);
    return { candidate: deezerBest.candidate, score: deezerBest.result.score };
  }

  console.debug("[tracks:match:rejected-all]", {
    sourceTrack: sourceForMatch,
    itunesBest: itunesBest
      ? {
          candidate: summarizeCandidate(itunesBest.candidate),
          score: itunesBest.result.score,
          reasons: itunesBest.result.reasons
        }
      : null,
    deezerBest: deezerBest
      ? {
          candidate: summarizeCandidate(deezerBest.candidate),
          score: deezerBest.result.score,
          reasons: deezerBest.result.reasons
        }
      : null
  });

  return null;
}

function toSourceTrackForMatch(track: StoredTrack): SourceTrackForMatch {
  return {
    sourceTrackId: track.sourceTrackId,
    title: track.title,
    artist: track.artist,
    album: track.album,
    durationMs: track.durationMs,
    isrc: track.isrc
  };
}

async function insertMatchedTrack(sourceTrack: GeneratedSourceTrack, candidate: PreviewCandidate, matchScore: number) {
  const [inserted] = await db
    .insert(tracks)
    .values({
      source: sourceTrack.source,
      sourceTrackId: sourceTrack.sourceTrackId,
      isrc: sourceTrack.isrc ?? null,
      artist: sourceTrack.artist,
      title: sourceTrack.title,
      album: sourceTrack.album ?? candidate.album ?? null,
      durationMs: sourceTrack.durationMs ?? candidate.durationMs ?? null,
      previewUrl: candidate.previewUrl!,
      previewProvider: candidate.provider,
      artworkUrl: sourceTrack.artworkUrl ?? candidate.artworkUrl ?? null,
      genre: sourceTrack.genre ?? null,
      releaseYear: sourceTrack.releaseYear ?? null,
      popularity: sourceTrack.popularity ?? null,
      matchScore
    })
    .onConflictDoNothing()
    .returning();

  if (inserted) return inserted;

  const existing = await findExistingTrack(sourceTrack.source, sourceTrack.sourceTrackId);
  if (!existing) {
    throw new AppError("TRACK_NOT_FOUND", "Could not persist matched track", 500);
  }
  return existing;
}

async function insertSelfPreviewedTrack(sourceTrack: GeneratedSourceTrack) {
  if (!sourceTrack.previewUrl) {
    throw new AppError("TRACK_NOT_FOUND", "Self-previewed track missing previewUrl", 500);
  }
  const [inserted] = await db
    .insert(tracks)
    .values({
      source: sourceTrack.source,
      sourceTrackId: sourceTrack.sourceTrackId,
      isrc: sourceTrack.isrc ?? null,
      artist: sourceTrack.artist,
      title: sourceTrack.title,
      album: sourceTrack.album ?? null,
      durationMs: sourceTrack.durationMs ?? null,
      previewUrl: sourceTrack.previewUrl,
      previewProvider: sourceTrack.previewProvider ?? sourceTrack.source,
      artworkUrl: sourceTrack.artworkUrl ?? null,
      genre: sourceTrack.genre ?? null,
      releaseYear: sourceTrack.releaseYear ?? null,
      popularity: sourceTrack.popularity ?? null,
      matchScore: 100
    })
    .onConflictDoNothing()
    .returning();

  if (inserted) return inserted;

  const existing = await findExistingTrack(sourceTrack.source, sourceTrack.sourceTrackId);
  if (!existing) {
    throw new AppError("TRACK_NOT_FOUND", "Could not persist self-previewed track", 500);
  }
  return existing;
}

async function persistAcceptedMatch(source: SourceTrackForMatch, candidate: PreviewCandidate, score: number) {
  await db
    .insert(trackMatches)
    .values({
      sourceTrackId: source.sourceTrackId,
      provider: candidate.provider,
      providerTrackId: candidate.providerTrackId,
      score,
      previewUrl: candidate.previewUrl!,
      metadata: candidate.metadata
    })
    .onConflictDoNothing();
}

async function persistMatchScores(source: SourceTrackForMatch, candidates: PreviewCandidate[]) {
  for (const candidate of candidates) {
    const result = scorePreviewCandidate(source, candidate);
    if (result.score >= ACCEPT_MATCH_THRESHOLD && candidate.previewUrl) continue;

    await db
      .insert(rejectedTrackMatches)
      .values({
        sourceTrackId: source.sourceTrackId,
        provider: candidate.provider,
        providerTrackId: candidate.providerTrackId,
        reason: result.reasons.join(",") || "below_threshold",
        score: result.score,
        metadata: candidate.metadata
      })
      .onConflictDoNothing();
  }
}

function logPreviewCandidates(provider: "itunes" | "deezer", source: SourceTrackForMatch, candidates: PreviewCandidate[]) {
  console.debug("[tracks:match:candidates]", {
    provider,
    sourceTrack: source,
    candidateCount: candidates.length,
    candidates: candidates.map((candidate) => {
      const result = scorePreviewCandidate(source, candidate);
      return {
        ...summarizeCandidate(candidate),
        score: result.score,
        reasons: result.reasons,
        acceptedByScore: result.score >= ACCEPT_MATCH_THRESHOLD && Boolean(candidate.previewUrl)
      };
    })
  });
}

function summarizeSourceTrack(track: GeneratedSourceTrack) {
  return {
    sourceTrackId: track.sourceTrackId,
    artist: track.artist,
    title: track.title,
    album: track.album,
    durationMs: track.durationMs,
    releaseYear: track.releaseYear,
    popularity: track.popularity
  };
}

function summarizeStoredTrack(track: StoredTrack) {
  return {
    id: track.id,
    artist: track.artist,
    title: track.title,
    previewProvider: track.previewProvider,
    matchScore: track.matchScore
  };
}

function summarizeCandidate(candidate: PreviewCandidate) {
  return {
    provider: candidate.provider,
    providerTrackId: candidate.providerTrackId,
    artist: candidate.artist,
    title: candidate.title,
    album: candidate.album,
    durationMs: candidate.durationMs,
    hasPreview: Boolean(candidate.previewUrl),
    previewUrl: candidate.previewUrl,
    artworkUrl: candidate.artworkUrl
  };
}
