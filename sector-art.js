export const SECTOR_ART_KEYS = Object.freeze([
  "technology",
  "financials",
  "health-care",
  "consumer-discretionary",
  "consumer-staples",
  "industrials",
  "communication-services",
  "materials",
  "energy",
  "utilities",
  "real-estate",
]);

const BUILT_IN_SECTOR_KEYS = new Set(SECTOR_ART_KEYS);
const SAFE_SECTOR_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function normalizeSectorKey(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return SAFE_SECTOR_KEY.test(normalized) ? normalized : "";
}

export function sectorArtPath(sectorKey, generatedSectorKeys = []) {
  const normalized = normalizeSectorKey(sectorKey);
  if (!normalized) return "";
  const generated = new Set([...generatedSectorKeys].map(normalizeSectorKey).filter(Boolean));
  if (!BUILT_IN_SECTOR_KEYS.has(normalized) && !generated.has(normalized)) return "";
  return `assets/sector-ceo-${normalized}-v2.webp`;
}

export function applySectorArtProbeState(event, failed) {
  const probe = event?.target;
  if (!probe?.matches?.("img[data-sector-art]")) return false;
  const ceo = probe.closest?.(".sector-ceo");
  if (!ceo) return false;
  probe.hidden = failed;
  if (failed) ceo.classList.add("sector-art-fallback", "has-image-error");
  else ceo.classList.remove("sector-art-fallback", "has-image-error");
  return true;
}
