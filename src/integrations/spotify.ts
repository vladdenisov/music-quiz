import { randomInt } from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "../domain/errors.js";
import {
  GENERATION_OPTIONS,
  type GenerationDecade,
  type GenerationGenre,
  type GenerationLanguage,
  type GenerationMood
} from "../domain/generation-options.js";
import type { GameSettings } from "../domain/types.js";

import type { GeneratedSourceTrack } from "./source-track.js";

export type SpotifySourceTrack = GeneratedSourceTrack & { source: "spotify" };

const CYRILLIC_RE = /[Ѐ-ӿ]/;
const DEFAULT_RUSSIAN_PLAYLIST_IDS = [
  "37i9dQZF1DX67MgnE9XYRb",
  "37i9dQZF1DWVw1pCWZWcGS",
  "37i9dQZF1DWUyG0ckHWHv7"
];
const UNWANTED_ALBUM_TYPES = new Set(["audiobook"]);

let accessToken: { value: string; expiresAt: number } | null = null;
const SPOTIFY_SEARCH_LIMIT_MAX = 10;
const SPOTIFY_SEARCH_PAGES = 5;
const SPOTIFY_SEARCH_RANDOM_PAGE_SPAN = 20;
const SPOTIFY_PLAYLIST_TARGET_MULTIPLIER = 4;

export async function generateSpotifyTracks(settings: GameSettings, minimumCount: number): Promise<SpotifySourceTrack[]> {
  const token = await getSpotifyToken();

  if (settings.source.type === "spotify_playlist") {
    if (!settings.source.value) {
      throw new AppError("INVALID_SETTINGS", "Spotify playlist source requires value", 400);
    }
    return shuffle(
      applyLocalFilters(await getPlaylistTracks(token, settings.source.value, settings.source.market ?? "US", minimumCount), settings)
    );
  }

  if (settings.source.type === "artist") {
    if (!settings.source.value) {
      throw new AppError("INVALID_SETTINGS", "Artist source requires value", 400);
    }
    return shuffle(
      applyLocalFilters(await getArtistTopTracks(token, settings.source.value, settings.source.market ?? "US", minimumCount), settings)
    );
  }

  if (settings.source.filters?.language === "russian") {
    const seeded = await seedFromRussianPlaylists(token, settings, minimumCount);
    if (seeded.length >= minimumCount) return seeded;
    const supplemented = [...seeded, ...(await searchTracks(token, settings, minimumCount))];
    return shuffle(dedupeSourceTracks(supplemented));
  }

  return searchTracks(token, settings, minimumCount);
}

function getRussianPlaylistIds() {
  const fromEnv = env.SPOTIFY_RUSSIAN_PLAYLIST_IDS.split(",").map((id) => id.trim()).filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : DEFAULT_RUSSIAN_PLAYLIST_IDS;
}

async function seedFromRussianPlaylists(token: string, settings: GameSettings, minimumCount: number) {
  const ids = getRussianPlaylistIds();
  const market = normalizeMarket(settings.source.filters?.region ?? "RU");
  const perPlaylistTarget = Math.max(Math.ceil(minimumCount / Math.max(ids.length, 1)) * 4, minimumCount);
  const collected: SpotifySourceTrack[] = [];

  for (const id of shuffle(ids)) {
    try {
      const tracks = await getPlaylistTracks(token, id, market, perPlaylistTarget);
      collected.push(...tracks);
      console.debug("[spotify:russian-seed:playlist]", { playlistId: id, count: tracks.length });
    } catch (error) {
      console.warn("[spotify:russian-seed:playlist-failed]", { playlistId: id, error: (error as Error).message });
    }
    if (dedupeSourceTracks(collected).length >= minimumCount * 4) break;
  }

  const filtered = applyLocalFilters(dedupeSourceTracks(collected), settings);
  console.debug("[spotify:russian-seed:summary]", {
    playlistIds: ids,
    rawCount: collected.length,
    filteredCount: filtered.length
  });
  return shuffle(filtered);
}

function dedupeSourceTracks(items: SpotifySourceTrack[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.sourceTrackId)) return false;
    seen.add(item.sourceTrackId);
    return true;
  });
}

async function getSpotifyToken() {
  if (accessToken && accessToken.expiresAt > Date.now() + 30_000) {
    return accessToken.value;
  }

  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) {
    throw new AppError("INVALID_SETTINGS", "Spotify credentials are required for track generation", 400);
  }

  const credentials = Buffer.from(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`).toString("base64");
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ grant_type: "client_credentials" })
  });

  if (!response.ok) {
    await logSpotifyFailure("auth", new URL("https://accounts.spotify.com/api/token"), response);
    throw new AppError("INVALID_SETTINGS", "Spotify authentication failed", 502);
  }

  const body = (await response.json()) as { access_token: string; expires_in: number };
  accessToken = {
    value: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000
  };
  return accessToken.value;
}

async function getPlaylistTracks(token: string, playlistIdOrUrl: string, market: string, limit: number) {
  const playlistId = extractSpotifyId(playlistIdOrUrl);
  const targetCount = Math.max(limit * SPOTIFY_PLAYLIST_TARGET_MULTIPLIER, limit);
  const firstPageUrl = new URL(`https://api.spotify.com/v1/playlists/${playlistId}`);
  const tracks: SpotifyTrack[] = [];

  firstPageUrl.searchParams.set("market", normalizeMarket(market));
  firstPageUrl.searchParams.set(
    "fields",
    [
      "id",
      "name",
      "tracks(href,limit,next,offset,total,items(track(id,name,duration_ms,popularity,explicit,external_ids,artists(id,name),album(name,album_type,release_date,images))))"
    ].join(",")
  );

  const firstPageResponse = await spotifyFetchRequired(token, firstPageUrl);
  const firstPage = (await firstPageResponse.json()) as SpotifyPlaylistResponse;
  console.debug("[spotify:playlist:first-page]", {
    playlistId,
    name: firstPage.name,
    embeddedItemCount: firstPage.tracks?.items?.length ?? 0,
    embeddedTrackCount: extractPlaylistTracks(firstPage.tracks?.items).length,
    next: firstPage.tracks?.next ?? null,
    total: firstPage.tracks?.total ?? null,
    limit: firstPage.tracks?.limit ?? null,
    offset: firstPage.tracks?.offset ?? null
  });
  tracks.push(...extractPlaylistTracks(firstPage.tracks?.items));

  let nextUrl = firstPage.tracks?.next ?? null;
  while (nextUrl && tracks.length < targetCount) {
    const nextPageResponse = await spotifyFetchRequired(token, new URL(nextUrl));
    const nextPage = (await nextPageResponse.json()) as SpotifyPlaylistItemsResponse;
    console.debug("[spotify:playlist:next-page]", {
      playlistId,
      itemCount: nextPage.items?.length ?? 0,
      trackCount: extractPlaylistTracks(nextPage.items).length,
      next: nextPage.next ?? null,
      limit: nextPage.limit ?? null,
      offset: nextPage.offset ?? null,
      total: nextPage.total ?? null
    });
    tracks.push(...extractPlaylistTracks(nextPage.items));
    nextUrl = nextPage.next ?? null;
  }

  if (tracks.length === 0) {
    console.warn("[spotify:playlist:fallback]", {
      playlistId,
      reason: "get_playlist_returned_no_track_items"
    });
    return getPlaylistTracksLegacy(token, playlistId, market, limit);
  }

  return dedupeSpotifyTracks(tracks).slice(0, targetCount).map(mapSpotifyTrack);
}

async function getPlaylistTracksLegacy(token: string, playlistIdOrUrl: string, market: string, limit: number) {
  const playlistId = extractSpotifyId(playlistIdOrUrl);
  const url = new URL(`https://api.spotify.com/v1/playlists/${playlistId}/items`);
  url.searchParams.set("market", normalizeMarket(market));
  url.searchParams.set("additional_types", "track");
  url.searchParams.set("limit", String(Math.min(100, Math.max(limit * 4, limit))));
  url.searchParams.set(
    "fields",
    "items(track(id,name,duration_ms,popularity,explicit,external_ids,artists(id,name),album(name,album_type,release_date,images))),next"
  );

  const response = await spotifyFetch(token, url, { allowUnauthorizedUserAuthRequired: true });
  if (!response) {
    console.warn("[spotify:playlist:fallback-unavailable]", {
      playlistId,
      endpoint: `${url.origin}${url.pathname}`,
      reason: "valid_user_authentication_required"
    });
    return [];
  }

  const body = (await response.json()) as { items: { track: SpotifyTrack | null }[] };
  return body.items.flatMap((item) => (item.track ? [mapSpotifyTrack(item.track)] : []));
}

async function getArtistTopTracks(token: string, artistIdOrUrl: string, market: string, limit: number) {
  const artistId = extractSpotifyId(artistIdOrUrl);
  const url = new URL(`https://api.spotify.com/v1/artists/${artistId}/top-tracks`);
  url.searchParams.set("market", market);

  const response = await spotifyFetchRequired(token, url);
  const body = (await response.json()) as { tracks: SpotifyTrack[] };
  return body.tracks.slice(0, Math.max(limit, 10)).map(mapSpotifyTrack);
}

async function searchTracks(token: string, settings: GameSettings, limit: number) {
  const market = getSearchMarket(settings);
  const queries = buildSpotifySearchQueries(settings);
  const searchLimit = getSpotifySearchLimit(limit);
  const items: SpotifyTrack[] = [];
  const targetCount = Math.max(limit * 4, limit);

  for (const query of queries) {
    for (const offset of getRandomSpotifySearchOffsets()) {
      const url = new URL("https://api.spotify.com/v1/search");
      url.searchParams.set("type", "track");
      url.searchParams.set("q", query);
      url.searchParams.set("market", market);
      url.searchParams.set("limit", String(searchLimit));
      url.searchParams.set("offset", String(offset));

      const response = await spotifyFetchRequired(token, url);
      const body = (await response.json()) as { tracks: { items: SpotifyTrack[] } };
      items.push(...body.tracks.items);

      const uniqueCount = dedupeSpotifyTracks(items).length;
      console.debug("[spotify:search:page-result]", {
        query,
        offset,
        itemCount: body.tracks.items.length,
        uniqueCount
      });

      if (uniqueCount >= targetCount) break;
    }

    if (dedupeSpotifyTracks(items).length >= targetCount) break;
  }

  const mapped = dedupeSpotifyTracks(items).map(mapSpotifyTrack);
  const filtered = applyLocalFilters(mapped, settings);
  console.debug("[spotify:search:summary]", {
    queries,
    rawUniqueCount: mapped.length,
    filteredCount: filtered.length,
    filteredOutCount: mapped.length - filtered.length,
    filteredPreview: filtered.slice(0, 20).map((track) => ({
      artist: track.artist,
      title: track.title,
      releaseYear: track.releaseYear,
      popularity: track.popularity
    }))
  });
  return shuffle(filtered);
}

async function spotifyFetch(
  token: string,
  url: URL,
  options: { allowUnauthorizedUserAuthRequired?: boolean } = {}
) {
  console.debug("[spotify:request]", {
    endpoint: `${url.origin}${url.pathname}`,
    params: Object.fromEntries(url.searchParams.entries())
  });

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    if (options.allowUnauthorizedUserAuthRequired && response.status === 401) {
      const body = await readResponseText(response);
      if (body.includes("Valid user authentication required")) {
        console.warn("[spotify:warn]", {
          status: response.status,
          endpoint: `${url.origin}${url.pathname}`,
          params: Object.fromEntries(url.searchParams.entries()),
          responseBody: body
        });
        return null;
      }
    }

    await logSpotifyFailure("api", url, response);
    throw new AppError("INVALID_SETTINGS", `Spotify request failed with ${response.status}`, 502);
  }

  return response;
}

async function spotifyFetchRequired(token: string, url: URL) {
  const response = await spotifyFetch(token, url);
  if (!response) {
    throw new AppError("INVALID_SETTINGS", "Spotify request unexpectedly returned no response", 502);
  }
  return response;
}

async function logSpotifyFailure(kind: "auth" | "api", url: URL, response: Response) {
  const responseBody = await readResponseText(response);

  console.error("[spotify:error]", {
    kind,
    status: response.status,
    statusText: response.statusText,
    endpoint: `${url.origin}${url.pathname}`,
    params: Object.fromEntries(url.searchParams.entries()),
    responseBody
  });
}

async function readResponseText(response: Response) {
  try {
    return await response.text();
  } catch {
    return "<failed to read response body>";
  }
}

function extractSpotifyId(value: string) {
  const match = value.match(/(?:playlist|artist)\/([A-Za-z0-9]+)/);
  return match?.[1] ?? value;
}

function mapSpotifyTrack(track: SpotifyTrack): SpotifySourceTrack {
  return {
    source: "spotify",
    sourceTrackId: track.id,
    isrc: track.external_ids?.isrc ?? null,
    artist: track.artists.map((artist) => artist.name).join(", "),
    title: track.name,
    album: track.album?.name ?? null,
    albumType: track.album?.album_type ?? null,
    durationMs: track.duration_ms ?? null,
    artworkUrl: track.album?.images?.[0]?.url ?? null,
    releaseYear: parseReleaseYear(track.album?.release_date),
    popularity: track.popularity ?? null,
    explicit: track.explicit ?? null
  };
}

function parseReleaseYear(value?: string) {
  if (!value) return null;
  const year = Number(value.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

type SpotifyTrack = {
  id: string;
  name: string;
  duration_ms?: number;
  popularity?: number;
  explicit?: boolean;
  external_ids?: { isrc?: string };
  artists: { id: string; name: string }[];
  album?: {
    name?: string;
    album_type?: string;
    release_date?: string;
    images?: { url: string }[];
  };
};

type SpotifyPlaylistTrackItem = {
  track?: SpotifyTrack | null;
};

type SpotifyPlaylistTracksPage = {
  items?: SpotifyPlaylistTrackItem[];
  next?: string | null;
  limit?: number;
  offset?: number;
  total?: number;
};

type SpotifyPlaylistResponse = {
  id: string;
  name?: string;
  tracks?: SpotifyPlaylistTracksPage;
};

type SpotifyPlaylistItemsResponse = SpotifyPlaylistTracksPage;

function extractPlaylistTracks(items?: SpotifyPlaylistTrackItem[]) {
  return (items ?? []).flatMap((item) => (item.track ? [item.track] : []));
}

export function buildSpotifySearchQuery(settings: GameSettings) {
  return buildSpotifySearchQueries(settings)[0] ?? "year:1970-2026";
}

export function buildSpotifySearchQueries(settings: GameSettings) {
  const filters = settings.source.filters;
  const genreQueries = [
    ...(settings.source.type === "genre" && settings.source.value ? getGenreSearchTerms(settings.source.value) : []),
    ...(filters?.genres ?? []).flatMap((genre) => getGenreSearchTerms(genre))
  ];
  const decadeQueries = (filters?.decades ?? []).map((decade) => getOptionQuery(GENERATION_OPTIONS.decades, decade));
  const moodQueries = (filters?.moods ?? []).map((mood) => getOptionQuery(GENERATION_OPTIONS.moods, mood));
  const languageQueries = getLanguageSearchTerms(filters?.language);
  const yearQuery = decadeQueries[0] ?? "year:1970-2026";
  const primaryLanguageQuery = languageQueries[0];
  const secondaryLanguageQuery = languageQueries[1] ?? primaryLanguageQuery;

  const queries = [
    compactQuery([genreQueries[0], yearQuery, moodQueries[0], primaryLanguageQuery]),
    compactQuery([genreQueries[1] ?? genreQueries[0], yearQuery, moodQueries[0], primaryLanguageQuery]),
    compactQuery([genreQueries[1] ?? genreQueries[0], yearQuery, secondaryLanguageQuery]),
    compactQuery([genreQueries[1] ?? genreQueries[0], yearQuery]),
    compactQuery([yearQuery, moodQueries[0], primaryLanguageQuery]),
    compactQuery([yearQuery, primaryLanguageQuery]),
    compactQuery([genreQueries[1] ?? genreQueries[0], primaryLanguageQuery]),
    ...languageQueries.slice(1).map((languageQuery) => compactQuery([genreQueries[1] ?? genreQueries[0], yearQuery, languageQuery])),
    compactQuery([yearQuery])
  ];

  return [...new Set(queries.filter(Boolean))];
}

function applyLocalFilters(tracks: SpotifySourceTrack[], settings: GameSettings) {
  const filters = settings.source.filters;
  if (!filters) return tracks.filter(isUsableQuizSourceTrack);

  return tracks
    .filter((track) => filters.explicitness !== "clean" || !track.explicit)
    .filter((track) => isUsableQuizSourceTrack(track))
    .filter((track) => matchesDecades(track, filters.decades))
    .filter((track) => matchesPopularity(track, filters.popularity))
    .filter((track) => matchesLanguage(track, filters.language));
}

function matchesLanguage(track: SpotifySourceTrack, language?: GenerationLanguage) {
  if (language !== "russian") return true;
  return CYRILLIC_RE.test(`${track.artist} ${track.title}`);
}

function compactQuery(parts: Array<string | undefined>) {
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function isUsableQuizSourceTrack(track: SpotifySourceTrack) {
  const title = track.title.toLowerCase();
  const album = track.album?.toLowerCase() ?? "";
  const unwanted = ["intro", "interlude", "outro", "skit", "commentary", "karaoke"];
  if (unwanted.some((marker) => title.includes(marker))) return false;
  if (title.includes("live") || album.includes("live")) return false;
  if (track.albumType && UNWANTED_ALBUM_TYPES.has(track.albumType.toLowerCase())) return false;
  if (looksLikeAudiobook(title, album)) return false;
  if (track.durationMs != null && track.durationMs < 45_000) return false;
  if (track.durationMs != null && track.durationMs > 9 * 60_000) return false;
  return true;
}

function looksLikeAudiobook(title: string, album: string) {
  const markers = ["chapter", "глава", "часть ", "audiobook", "аудиокнига", "сказк", "лекция", "лекции", "монолог"];
  return markers.some((marker) => title.includes(marker) || album.includes(marker));
}

function matchesDecades(track: SpotifySourceTrack, decades?: GenerationDecade[]) {
  if (!decades?.length || !track.releaseYear) return true;
  return decades.some((decade) => {
    const start = Number(decade.slice(0, 4));
    return track.releaseYear! >= start && track.releaseYear! <= start + 9;
  });
}

function matchesPopularity(track: SpotifySourceTrack, popularity?: GameSettings["source"]["filters"] extends infer Filters ? Filters extends { popularity?: infer P } ? P : never : never) {
  if (!popularity || track.popularity == null) return true;

  if (popularity === "mainstream") return track.popularity >= 75;
  if (popularity === "popular") return track.popularity >= 60;
  if (popularity === "balanced") return track.popularity >= 35;
  if (popularity === "deep_cuts") return track.popularity >= 15 && track.popularity <= 65;
  if (popularity === "discovery") return track.popularity <= 45;
  return true;
}

function normalizeMarket(market: string) {
  return market === "global" ? "US" : market;
}

function getSearchMarket(settings: GameSettings) {
  if (settings.source.filters?.region) return normalizeMarket(settings.source.filters.region);
  if (settings.source.filters?.language === "russian") return "RU";
  return normalizeMarket(settings.source.market ?? "US");
}

export function getSpotifySearchLimit(requestedMinimum: number) {
  return Math.min(SPOTIFY_SEARCH_LIMIT_MAX, Math.max(requestedMinimum * 4, requestedMinimum));
}

export function getSpotifySearchOffsets() {
  return Array.from({ length: SPOTIFY_SEARCH_PAGES }, (_, index) => index * SPOTIFY_SEARCH_LIMIT_MAX);
}

export function getRandomSpotifySearchOffsets() {
  const firstOffset = 0;
  const randomOffsets = new Set<number>();

  while (randomOffsets.size < SPOTIFY_SEARCH_PAGES - 1) {
    randomOffsets.add(randomInt(1, SPOTIFY_SEARCH_RANDOM_PAGE_SPAN + 1) * SPOTIFY_SEARCH_LIMIT_MAX);
  }

  return [firstOffset, ...randomOffsets];
}

function dedupeSpotifyTracks(items: SpotifyTrack[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [copy[index], copy[swapIndex]] = [copy[swapIndex]!, copy[index]!];
  }
  return copy;
}

function getOptionQuery<T extends GenerationDecade | GenerationGenre | GenerationMood>(
  options: readonly { id: T; spotifyQuery?: string }[],
  id: T
) {
  return options.find((option) => option.id === id)?.spotifyQuery ?? id;
}

function getGenreSearchTerms(value: string) {
  const optionQuery = getOptionQuery(GENERATION_OPTIONS.genres, value as GenerationGenre);
  const baseTerms = optionQuery.startsWith("genre:") ? [optionQuery, optionQuery.replace(/^genre:/, "")] : [optionQuery];

  if (value === "rus_rock") {
    return ["русский рок", "russian rock", "рок", ...baseTerms];
  }
  if (value === "rus_pop") {
    return ["русская поп музыка", "russian pop", "поп", ...baseTerms];
  }
  if (value === "rus_rap") {
    return ["русский рэп", "russian rap", "рэп", ...baseTerms];
  }
  if (value === "post_soviet") {
    return ["постсоветские хиты", "русские хиты", ...baseTerms];
  }

  return baseTerms;
}

function getLanguageSearchTerms(language?: GenerationLanguage) {
  if (language === "russian") return ["русский", "россия", "russian"];
  if (language === "english") return ["english"];
  return [];
}
