import { randomInt } from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "../domain/errors.js";
import type { GameSettings } from "../domain/types.js";
import type { GeneratedSourceTrack } from "./source-track.js";

const LASTFM_BASE = "https://ws.audioscrobbler.com/2.0/";

type LastfmTrack = {
  name: string;
  duration?: string;
  playcount?: string;
  listeners?: string;
  mbid?: string;
  artist?: { name?: string; "#text"?: string };
  image?: { "#text"?: string; size?: string }[];
};

export async function generateLastfmTracks(settings: GameSettings, minimumCount: number): Promise<GeneratedSourceTrack[]> {
  if (!env.LASTFM_API_KEY) {
    throw new AppError("INVALID_SETTINGS", "Last.fm requires LASTFM_API_KEY", 400);
  }

  const target = Math.max(minimumCount * 4, minimumCount);
  const type = settings.source.type;
  const filters = settings.source.filters;

  let raw: LastfmTrack[] = [];

  if (type === "lastfm_tag") {
    const tag = settings.source.value ?? mapLanguageToTag(filters?.language) ?? "pop";
    raw = await fetchTagTopTracks(tag, target);
  } else if (type === "lastfm_geo") {
    const country = settings.source.value ?? mapRegionToCountry(filters?.region) ?? "russia";
    raw = await fetchGeoTopTracks(country, target);
  } else if (type === "lastfm_chart") {
    raw = await fetchChartTopTracks(target);
  } else if (filters?.language === "russian") {
    raw = await fetchGeoTopTracks("russia", target);
  } else if (filters?.genres?.length) {
    raw = await fetchTagTopTracks(filters.genres[0]!, target);
  } else {
    raw = await fetchChartTopTracks(target);
  }

  const mapped = raw.map(mapLastfmTrack).filter((track) => track.artist && track.title);
  const filtered = applyLocalFilters(mapped, settings);
  return shuffle(filtered);
}

async function fetchTagTopTracks(tag: string, target: number): Promise<LastfmTrack[]> {
  const params = new URLSearchParams({
    method: "tag.gettoptracks",
    tag,
    api_key: env.LASTFM_API_KEY,
    format: "json",
    limit: String(Math.min(target, 1000))
  });
  const body = await lastfmFetch<{ tracks?: { track?: LastfmTrack[] } }>(params);
  return body.tracks?.track ?? [];
}

async function fetchGeoTopTracks(country: string, target: number): Promise<LastfmTrack[]> {
  const params = new URLSearchParams({
    method: "geo.gettoptracks",
    country,
    api_key: env.LASTFM_API_KEY,
    format: "json",
    limit: String(Math.min(target, 1000))
  });
  const body = await lastfmFetch<{ tracks?: { track?: LastfmTrack[] } }>(params);
  return body.tracks?.track ?? [];
}

async function fetchChartTopTracks(target: number): Promise<LastfmTrack[]> {
  const params = new URLSearchParams({
    method: "chart.gettoptracks",
    api_key: env.LASTFM_API_KEY,
    format: "json",
    limit: String(Math.min(target, 1000))
  });
  const body = await lastfmFetch<{ tracks?: { track?: LastfmTrack[] } }>(params);
  return body.tracks?.track ?? [];
}

async function lastfmFetch<T>(params: URLSearchParams): Promise<T> {
  const response = await fetch(`${LASTFM_BASE}?${params}`);
  if (!response.ok) throw new AppError("INVALID_SETTINGS", `Last.fm request failed ${response.status}`, 502);
  return (await response.json()) as T;
}

function mapLastfmTrack(track: LastfmTrack): GeneratedSourceTrack {
  const artistName = track.artist?.name ?? track.artist?.["#text"] ?? "";
  const artworkUrl = track.image?.find((image) => image.size === "extralarge")?.["#text"] ?? track.image?.[track.image.length - 1]?.["#text"] ?? null;
  const durationSec = track.duration ? Number(track.duration) : 0;

  return {
    source: "lastfm",
    sourceTrackId: track.mbid || `${artistName}::${track.name}`,
    artist: artistName,
    title: track.name,
    album: null,
    durationMs: durationSec > 0 ? durationSec * 1000 : null,
    artworkUrl: artworkUrl || null,
    popularity: track.listeners ? Math.min(100, Math.round(Math.log10(Number(track.listeners) + 1) * 14)) : null,
    previewUrl: null,
    previewProvider: null
  };
}

function applyLocalFilters(tracks: GeneratedSourceTrack[], settings: GameSettings): GeneratedSourceTrack[] {
  const filters = settings.source.filters;
  return tracks.filter((track) => {
    if (filters?.language === "russian" && !/[Ѐ-ӿ]/.test(`${track.artist} ${track.title}`)) return false;
    const title = track.title.toLowerCase();
    if (["intro", "interlude", "outro", "skit", "karaoke", "audiobook"].some((m) => title.includes(m))) return false;
    return true;
  });
}

function mapLanguageToTag(language?: string) {
  if (language === "russian") return "russian";
  if (language === "english") return "english";
  return null;
}

function mapRegionToCountry(region?: string) {
  if (region === "RU") return "russia";
  if (region === "US") return "united states";
  if (region === "GB") return "united kingdom";
  if (region === "UA") return "ukraine";
  if (region === "KZ") return "kazakhstan";
  if (region === "DE") return "germany";
  if (region === "FR") return "france";
  if (region === "IT") return "italy";
  if (region === "ES") return "spain";
  if (region === "BR") return "brazil";
  if (region === "MX") return "mexico";
  if (region === "KR") return "south korea";
  if (region === "JP") return "japan";
  return null;
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}
