import { describe, expect, it } from "vitest";
import { scorePreviewCandidate } from "../domain/matching.js";

describe("scorePreviewCandidate", () => {
  it("accepts a near exact candidate with preview", () => {
    const result = scorePreviewCandidate(
      {
        sourceTrackId: "spotify:1",
        title: "Toxic",
        artist: "Britney Spears",
        album: "In The Zone",
        durationMs: 198_000
      },
      {
        provider: "itunes",
        providerTrackId: "1",
        title: "Toxic",
        artist: "Britney Spears",
        album: "In The Zone",
        durationMs: 199_000,
        previewUrl: "https://example.test/toxic.m4a",
        metadata: {}
      }
    );

    expect(result.score).toBeGreaterThanOrEqual(75);
  });

  it("rejects candidates without preview", () => {
    const result = scorePreviewCandidate(
      {
        sourceTrackId: "spotify:1",
        title: "Toxic",
        artist: "Britney Spears",
        album: "In The Zone",
        durationMs: 198_000
      },
      {
        provider: "itunes",
        providerTrackId: "1",
        title: "Toxic",
        artist: "Britney Spears",
        album: "In The Zone",
        durationMs: 199_000,
        metadata: {}
      }
    );

    expect(result.score).toBeLessThan(75);
    expect(result.reasons).toContain("missing_preview");
  });

  it("penalizes unwanted version mismatches", () => {
    const result = scorePreviewCandidate(
      {
        sourceTrackId: "spotify:1",
        title: "Toxic",
        artist: "Britney Spears"
      },
      {
        provider: "itunes",
        providerTrackId: "1",
        title: "Toxic - Karaoke Version",
        artist: "Britney Spears",
        previewUrl: "https://example.test/toxic.m4a",
        metadata: {}
      }
    );

    expect(result.reasons).toContain("unwanted_version_mismatch");
  });

  it("matches equivalent dash and parenthetical version suffixes", () => {
    const result = scorePreviewCandidate(
      {
        sourceTrackId: "spotify:1",
        title: "Rock with You - Single Version",
        artist: "Michael Jackson",
        album: "Off the Wall",
        durationMs: 219_926
      },
      {
        provider: "itunes",
        providerTrackId: "1",
        title: "Rock With You",
        artist: "Michael Jackson",
        album: "Off the Wall",
        durationMs: 219_926,
        previewUrl: "https://example.test/rock-with-you.m4a",
        metadata: {}
      }
    );

    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.reasons).toContain("title_exact_or_near");
  });

  it("preserves meaningful parenthetical title text while stripping version brackets", () => {
    const result = scorePreviewCandidate(
      {
        sourceTrackId: "spotify:1",
        title: "Disco Nights (Rock Freak) - Single Remix",
        artist: "G.Q.",
        album: "Disco Nights (Expanded Edition)",
        durationMs: 236_120
      },
      {
        provider: "itunes",
        providerTrackId: "1",
        title: "Disco Nights (Rock Freak) [Single Remix]",
        artist: "G.Q.",
        album: "Disco Nights (Expanded Edition)",
        durationMs: 236_120,
        previewUrl: "https://example.test/disco-nights.m4a",
        metadata: {}
      }
    );

    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.reasons).toContain("title_exact_or_near");
  });

  it("matches primary artists when Spotify includes producer credits", () => {
    const result = scorePreviewCandidate(
      {
        sourceTrackId: "spotify:1",
        title: "Ventura Highway",
        artist: "America, George Martin",
        album: "Homecoming",
        durationMs: 211_680
      },
      {
        provider: "itunes",
        providerTrackId: "1",
        title: "Ventura Highway (George Martin Remix)",
        artist: "America",
        album: "70's Classic Rock",
        durationMs: 211_680,
        previewUrl: "https://example.test/ventura-highway.m4a",
        metadata: {}
      }
    );

    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.reasons).toContain("artist_exact_or_near");
  });

  it("penalizes unwanted version mismatches inside parentheses", () => {
    const result = scorePreviewCandidate(
      {
        sourceTrackId: "spotify:1",
        title: "Toxic",
        artist: "Britney Spears"
      },
      {
        provider: "itunes",
        providerTrackId: "1",
        title: "Toxic (Live)",
        artist: "Britney Spears",
        previewUrl: "https://example.test/toxic-live.m4a",
        metadata: {}
      }
    );

    expect(result.reasons).toContain("unwanted_version_mismatch");
  });
});
