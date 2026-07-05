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

function normalizeSectorKey(value) {
  return String(value || "").trim().toLowerCase();
}

export function sectorArtPath(sectorKey) {
  const normalized = normalizeSectorKey(sectorKey);
  if (!BUILT_IN_SECTOR_KEYS.has(normalized)) return "";
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
