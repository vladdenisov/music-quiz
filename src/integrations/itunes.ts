import type { PreviewCandidate, SourceTrackForMatch } from "../domain/matching.js";

export async function searchItunesPreviewCandidates(source: SourceTrackForMatch, market = "US"): Promise<PreviewCandidate[]> {
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", `${source.artist} ${source.title}`);
  url.searchParams.set("entity", "song");
  url.searchParams.set("limit", "15");
  url.searchParams.set("country", market);

  const response = await fetch(url);
  if (!response.ok) return [];

  const body = (await response.json()) as { results: ItunesResult[] };
  return body.results.map((result) => ({
    provider: "itunes",
    providerTrackId: String(result.trackId),
    title: result.trackName,
    artist: result.artistName,
    album: result.collectionName ?? null,
    durationMs: result.trackTimeMillis ?? null,
    previewUrl: result.previewUrl ?? null,
    artworkUrl: result.artworkUrl100?.replace("100x100bb", "600x600bb") ?? null,
    metadata: result as unknown as Record<string, unknown>
  }));
}

type ItunesResult = {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  trackTimeMillis?: number;
  previewUrl?: string;
  artworkUrl100?: string;
};
