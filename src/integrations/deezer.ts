import type { PreviewCandidate, SourceTrackForMatch } from "../domain/matching.js";

export async function searchDeezerPreviewCandidates(source: SourceTrackForMatch): Promise<PreviewCandidate[]> {
  const url = new URL("https://api.deezer.com/search");
  url.searchParams.set("q", `artist:"${source.artist}" track:"${source.title}"`);
  url.searchParams.set("limit", "15");

  const response = await fetch(url);
  if (!response.ok) return [];

  const body = (await response.json()) as { data?: DeezerResult[] };
  return (body.data ?? []).map((result) => ({
    provider: "deezer",
    providerTrackId: String(result.id),
    title: result.title,
    artist: result.artist?.name ?? "",
    album: result.album?.title ?? null,
    durationMs: result.duration ? result.duration * 1000 : null,
    previewUrl: result.preview || null,
    artworkUrl: result.album?.cover_big ?? result.album?.cover_medium ?? null,
    metadata: result as unknown as Record<string, unknown>
  }));
}

type DeezerResult = {
  id: number;
  title: string;
  duration?: number;
  preview?: string;
  artist?: { name?: string };
  album?: { title?: string; cover_big?: string; cover_medium?: string };
};
