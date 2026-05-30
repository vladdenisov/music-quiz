const DEFAULT_PREVIEW_CHECK_TIMEOUT_MS = 5_000;

export async function isPreviewUrlReachable(url: string, timeoutMs = DEFAULT_PREVIEW_CHECK_TIMEOUT_MS) {
  if (await checkPreviewRequest(url, "HEAD", timeoutMs)) return true;
  return checkPreviewRequest(url, "GET", timeoutMs, { Range: "bytes=0-0" });
}

async function checkPreviewRequest(url: string, method: "HEAD" | "GET", timeoutMs: number, headers?: Record<string, string>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method, headers, signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
