import type { SourceProvider } from "../domain/types.js";

export type GeneratedSourceTrack = {
  source: SourceProvider;
  sourceTrackId: string;
  isrc?: string | null;
  artist: string;
  title: string;
  album?: string | null;
  albumType?: string | null;
  durationMs?: number | null;
  artworkUrl?: string | null;
  genre?: string | null;
  releaseYear?: number | null;
  popularity?: number | null;
  explicit?: boolean | null;
  previewUrl?: string | null;
  previewProvider?: "deezer" | "itunes" | null;
};
