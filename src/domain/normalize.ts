const FEATURE_RE = /\s+(feat\.?|ft\.?|featuring)\s+.+$/i;
const BRACKET_RE = /[\[(]([^\])]+)[\])]/g;
const DASH_VERSION_SUFFIX_RE =
  /\s+[-–—]\s+(?:\d{4}\s+)?(?:single|album|radio|original|super|club|disco|extended|alternate)?\s*(?:version|edit|mix|remix|remaster(?:ed)?|mono|stereo)(?:\s+\d{4})?\s*$/i;
const PUNCT_RE = /[^\p{L}\p{N}\s]/gu;
const SPACE_RE = /\s+/g;
const VERSION_MARKERS = [
  "version",
  "edit",
  "mix",
  "remix",
  "remaster",
  "remastered",
  "live",
  "mono",
  "stereo",
  "deluxe",
  "bonus",
  "demo",
  "instrumental",
  "karaoke",
  "sped up",
  "slowed",
  "nightcore"
];

export function normalizeMusicText(value: string) {
  return value
    .toLowerCase()
    .replace(FEATURE_RE, "")
    .replace(BRACKET_RE, (_, content: string) => (isVersionQualifier(content) ? " " : ` ${content} `))
    .replace(DASH_VERSION_SUFFIX_RE, "")
    .replace(PUNCT_RE, " ")
    .replace(SPACE_RE, " ")
    .trim();
}

export function tokenSimilarity(left: string, right: string) {
  const leftTokens = new Set(normalizeMusicText(left).split(" ").filter(Boolean));
  const rightTokens = new Set(normalizeMusicText(right).split(" ").filter(Boolean));

  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }

  return intersection / Math.max(leftTokens.size, rightTokens.size);
}

export function hasUnwantedVersionMismatch(sourceTitle: string, candidateTitle: string) {
  const markers = ["live", "remix", "karaoke", "cover", "sped up", "slowed", "nightcore", "instrumental"];

  return markers.some((marker) => !containsMarker(sourceTitle, marker) && containsMarker(candidateTitle, marker));
}

export function sameNormalizedValue(left: string, right: string) {
  return normalizeMusicText(left) === normalizeMusicText(right);
}

function isVersionQualifier(value: string) {
  const normalized = normalizeForMarkerSearch(value);
  return VERSION_MARKERS.some((marker) => normalized.includes(marker)) || /\b\d{4}\b/.test(normalized);
}

function containsMarker(value: string, marker: string) {
  return normalizeForMarkerSearch(value).includes(marker);
}

function normalizeForMarkerSearch(value: string) {
  return value.toLowerCase().replace(PUNCT_RE, " ").replace(SPACE_RE, " ").trim();
}
