import { afterEach, describe, expect, it, vi } from "vitest";
import { isPreviewUrlReachable } from "../domain/preview-url.js";

describe("isPreviewUrlReachable", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts a successful HEAD response without fallback", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(isPreviewUrlReachable("https://example.test/preview.mp3")).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/preview.mp3",
      expect.objectContaining({ method: "HEAD" })
    );
  });

  it("falls back to a ranged GET when HEAD fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(new Response(null, { status: 206 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(isPreviewUrlReachable("https://example.test/preview.mp3")).resolves.toBe(true);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://example.test/preview.mp3",
      expect.objectContaining({
        method: "GET",
        headers: { Range: "bytes=0-0" }
      })
    );
  });

  it("rejects a preview when both checks fail", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(isPreviewUrlReachable("https://example.test/preview.mp3")).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
