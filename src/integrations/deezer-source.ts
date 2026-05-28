import { randomInt } from "node:crypto";
import { AppError } from "../domain/errors.js";
import type { GenerationGenre, GenerationLanguage, GenerationMood } from "../domain/generation-options.js";
import { GENERATION_OPTIONS } from "../domain/generation-options.js";
import type { GameSettings } from "../domain/types.js";
import type { GeneratedSourceTrack } from "./source-track.js";

const DEEZER_BASE = "https://api.deezer.com";
const DEEZER_LIMIT_PER_PAGE = 100;
const CYRILLIC_RE = /[Ѐ-ӿ]/;

const DEEZER_RUSSIAN_PLAYLIST_IDS = [
  "1116190301",
  "1644698242",
  "1265257181"
];

type DeezerTrack = {
  id: number;
  title: string;
  title_short?: string;
  duration?: number;
  preview?: string;
  explicit_lyrics?: boolean;
  artist?: { id?: number; name?: string };
  album?: { id?: number; title?: string; cover_xl?: string; cover_big?: string; cover_medium?: string };
};

export async function generateDeezerTracks(settings: GameSettings, minimumCount: number): Promise<GeneratedSourceTrack[]> {
  const target = Math.max(minimumCount * 3, minimumCount);
  const type = settings.source.type;
  const filters = settings.source.filters;

  if (type === "deezer_playlist" || type === "spotify_playlist") {
    if (!settings.source.value) throw new AppError("INVALID_SETTINGS", "Deezer playlist source requires value", 400);
    const tracks = await fetchPlaylistTracks(settings.source.value, target);
    return finalize(tracks, settings);
  }

  if (type === "deezer_chart") {
    const genreId = parseGenreId(settings.source.value) ?? 0;
    return finalize(await fetchChart(genreId, target), settings);
  }

  if (type === "artist") {
    if (!settings.source.value) throw new AppError("INVALID_SETTINGS", "Artist source requires value", 400);
    return finalize(await fetchArtistTop(settings.source.value, target), settings);
  }

  if (filters?.language === "russian") {
    const seeded = await seedFromPlaylists(DEEZER_RUSSIAN_PLAYLIST_IDS, target);
    if (seeded.length >= minimumCount) return finalize(seeded, settings);
    const more = await searchByFilters(settings, target);
    return finalize([...seeded, ...more], settings);
  }

  return finalize(await searchByFilters(settings, target), settings);
}

async function fetchPlaylistTracks(idOrUrl: string, target: number): Promise<DeezerTrack[]> {
  const id = extractDeezerId(idOrUrl);
  const collected: DeezerTrack[] = [];
  let url = `${DEEZER_BASE}/playlist/${id}/tracks?limit=${DEEZER_LIMIT_PER_PAGE}`;

  while (url && collected.length < target * 2) {
    const body = await deezerFetch<{ data?: DeezerTrack[]; next?: string }>(url);
    collected.push(...(body.data ?? []));
    url = body.next ?? "";
  }

  return collected;
}

async function fetchChart(genreId: number, target: number): Promise<DeezerTrack[]> {
  const url = `${DEEZER_BASE}/chart/${genreId}/tracks?limit=${Math.min(target * 2, 100)}`;
  const body = await deezerFetch<{ data?: DeezerTrack[] }>(url);
  return body.data ?? [];
}

async function fetchArtistTop(idOrUrl: string, target: number): Promise<DeezerTrack[]> {
  const id = extractDeezerId(idOrUrl);
  const url = `${DEEZER_BASE}/artist/${id}/top?limit=${Math.min(target, 100)}`;
  const body = await deezerFetch<{ data?: DeezerTrack[] }>(url);
  return body.data ?? [];
}

async function seedFromPlaylists(ids: string[], target: number): Promise<DeezerTrack[]> {
  const collected: DeezerTrack[] = [];
  for (const id of shuffle(ids)) {
    try {
      const tracks = await fetchPlaylistTracks(id, target);
      collected.push(...tracks);
    } catch (error) {
      console.warn("[deezer:seed:playlist-failed]", { playlistId: id, error: (error as Error).message });
    }
    if (collected.length >= target * 2) break;
  }
  return collected;
}

async function searchByFilters(settings: GameSettings, target: number): Promise<DeezerTrack[]> {
  const queries = buildSearchQueries(settings);
  const collected: DeezerTrack[] = [];

  for (const query of queries) {
    const url = `${DEEZER_BASE}/search?q=${encodeURIComponent(query)}&limit=${Math.min(target * 2, 100)}&order=RANKING`;
    try {
      const body = await deezerFetch<{ data?: DeezerTrack[] }>(url);
      collected.push(...(body.data ?? []));
    } catch (error) {
      console.warn("[deezer:search:failed]", { query, error: (error as Error).message });
    }
    if (collected.length >= target * 2) break;
  }

  return collected;
}

function buildSearchQueries(settings: GameSettings): string[] {
  const filters = settings.source.filters;
  const parts: string[] = [];

  if (filters?.language === "russian") parts.push("русский");
  if (filters?.language === "english") parts.push("english");

  if (settings.source.type === "genre" && settings.source.value) {
    parts.push(...getGenreSearchTerms(settings.source.value as GenerationGenre));
  }
  for (const genre of filters?.genres ?? []) parts.push(...getGenreSearchTerms(genre));
  for (const mood of filters?.moods ?? []) parts.push(getOptionQuery(GENERATION_OPTIONS.moods, mood));

  const base = parts.filter(Boolean);
  if (base.length === 0) return ["top"];
  return [...new Set(base)];
}

function getGenreSearchTerms(value: GenerationGenre): string[] {
  if (value === "rus_rock") return ["русский рок"];
  if (value === "rus_pop") return ["русская поп"];
  if (value === "rus_rap") return ["русский рэп"];
  if (value === "post_soviet") return ["русские хиты"];
  return [getOptionQuery(GENERATION_OPTIONS.genres, value).replace(/^genre:/, "")];
}

function getOptionQuery<T extends GenerationGenre | GenerationMood>(
  options: readonly { id: T; spotifyQuery?: string }[],
  id: T
) {
  return options.find((opt) => opt.id === id)?.spotifyQuery ?? String(id);
}

function finalize(tracks: DeezerTrack[], settings: GameSettings): GeneratedSourceTrack[] {
  const mapped = dedupe(tracks).map(mapDeezerTrack);
  const filtered = applyLocalFilters(mapped, settings);
  return shuffle(filtered);
}

function mapDeezerTrack(track: DeezerTrack): GeneratedSourceTrack {
  return {
    source: "deezer",
    sourceTrackId: String(track.id),
    artist: track.artist?.name ?? "",
    title: track.title_short ?? track.title,
    album: track.album?.title ?? null,
    durationMs: track.duration ? track.duration * 1000 : null,
    artworkUrl: track.album?.cover_xl ?? track.album?.cover_big ?? track.album?.cover_medium ?? null,
    previewUrl: track.preview || null,
    previewProvider: track.preview ? "deezer" : null,
    explicit: track.explicit_lyrics ?? null
  };
}

function applyLocalFilters(tracks: GeneratedSourceTrack[], settings: GameSettings): GeneratedSourceTrack[] {
  const filters = settings.source.filters;
  return tracks
    .filter((track) => track.previewUrl)
    .filter((track) => track.artist && track.title)
    .filter((track) => filters?.explicitness !== "clean" || !track.explicit)
    .filter((track) => isUsableQuizSourceTrack(track))
    .filter((track) => matchesLanguage(track, filters?.language));
}

function matchesLanguage(track: GeneratedSourceTrack, language?: GenerationLanguage) {
  if (language !== "russian") return true;
  return CYRILLIC_RE.test(`${track.artist} ${track.title}`);
}

function isUsableQuizSourceTrack(track: GeneratedSourceTrack) {
  const title = track.title.toLowerCase();
  const album = track.album?.toLowerCase() ?? "";
  const unwanted = ["intro", "interlude", "outro", "skit", "commentary", "karaoke", "audiobook", "аудиокнига", "сказк", "лекция", "глава ", "chapter "];
  if (unwanted.some((m) => title.includes(m) || album.includes(m))) return false;
  if (title.includes("live") || album.includes("live")) return false;
  if (track.durationMs != null && track.durationMs < 45_000) return false;
  if (track.durationMs != null && track.durationMs > 9 * 60_000) return false;
  return true;
}

async function deezerFetch<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new AppError("INVALID_SETTINGS", `Deezer request failed ${response.status}`, 502);
  }
  const body = (await response.json()) as T & { error?: { message?: string; code?: number } };
  if ((body as { error?: { code?: number } }).error) {
    throw new AppError("INVALID_SETTINGS", `Deezer error: ${(body as { error?: { message?: string } }).error?.message ?? "unknown"}`, 502);
  }
  return body;
}

function extractDeezerId(value: string) {
  const match = value.match(/(?:playlist|artist|album)\/(\d+)/);
  return match?.[1] ?? value;
}

function parseGenreId(value?: string) {
  if (!value) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function dedupe(tracks: DeezerTrack[]) {
  const seen = new Set<number>();
  return tracks.filter((track) => {
    if (seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}
