export const EVENT_GRADES = Object.freeze([
  Object.freeze({ id: "common", probability: 0.6, min: 0.05, max: 0.1 }),
  Object.freeze({ id: "advanced", probability: 0.3, min: 0.15, max: 0.2 }),
  Object.freeze({ id: "rare", probability: 0.06, min: 0.25, max: 0.45 }),
  Object.freeze({ id: "epic", probability: 0.035, min: 0.5, max: 0.65 }),
  Object.freeze({ id: "disaster", probability: 0.005, min: 0.7, max: 0.85 }),
]);

export const EVENT_TEMPLATES = Object.freeze([
  Object.freeze({ id: "ai-demand", nameKo: "AI 수요 폭증", nameEn: "AI Demand Surge", target: "stock", sectorIndex: 0, direction: 1 }),
  Object.freeze({ id: "rate-shock", nameKo: "금리 충격", nameEn: "Rate Shock", target: "stock", sectorIndex: 1, direction: -1 }),
  Object.freeze({ id: "medical-breakthrough", nameKo: "신약 임상 성공", nameEn: "Medical Breakthrough", target: "stock", sectorIndex: 2, direction: 1 }),
  Object.freeze({ id: "consumer-freeze", nameKo: "소비 심리 급랭", nameEn: "Consumer Freeze", target: "stock", sectorIndex: 3, direction: -1 }),
  Object.freeze({ id: "supply-crisis", nameKo: "공급망 대란", nameEn: "Supply Crisis", target: "market", direction: -1 }),
  Object.freeze({ id: "global-boom", nameKo: "글로벌 경기 호황", nameEn: "Global Boom", target: "market", direction: 1, assetModifiers: { copper: 0.12, gold: -0.03 } }),
  Object.freeze({ id: "global-inflation", nameKo: "글로벌 인플레이션", nameEn: "Global Inflation", target: "market", direction: -1, assetModifiers: { gold: 0.14, copper: 0.08 } }),
  Object.freeze({ id: "war-risk", nameKo: "전쟁 위험 고조", nameEn: "War Risk", target: "asset", assetKey: "gold", direction: 1, assetModifiers: { gold: 0.22, copper: -0.1, coin: 0.08 } }),
  Object.freeze({ id: "coin-panic", nameKo: "코인 광풍", nameEn: "Crypto Mania", target: "asset", assetKey: "coin", direction: 1, assetModifiers: { coin: 0.35 } }),
  Object.freeze({ id: "utility-subsidy", nameKo: "공공요금 지원", nameEn: "Utility Subsidy", target: "stock", sectorIndex: 9, direction: 1, duration: 2 }),
]);

export const DICE_EVENTS = Object.freeze({
  1: Object.freeze({ id: "personal-drop", labelKo: "개인 악재", labelEn: "Personal setback", direction: -1, rate: 0.04, scope: "holding" }),
  2: Object.freeze({ id: "market-dip", labelKo: "시장 소폭 하락", labelEn: "Market dip", direction: -1, rate: 0.05, scope: "market" }),
  3: Object.freeze({ id: "survival-bonus", labelKo: "생존 지원금", labelEn: "Survival support", cash: 29, scope: "cash" }),
  4: Object.freeze({ id: "market-rise", labelKo: "시장 소폭 상승", labelEn: "Market rise", direction: 1, rate: 0.04, scope: "market" }),
  5: Object.freeze({ id: "personal-rise", labelKo: "주력 섹터 상승", labelEn: "Core sector rise", direction: 1, rate: 0.07, scope: "holding" }),
  6: Object.freeze({ id: "event-card", labelKo: "정식 이벤트카드", labelEn: "Event card", scope: "card" }),
});

export function eventForRoll(roll) {
  const value = Math.max(1, Math.min(6, Math.floor(Number(roll) || 1)));
  return DICE_EVENTS[value];
}

export function drawEventCard(random = Math.random, preferredSectorIndex = null) {
  const gradeRoll = random();
  let cursor = 0;
  const grade = EVENT_GRADES.find((candidate) => {
    cursor += candidate.probability;
    return gradeRoll < cursor;
  }) || EVENT_GRADES.at(-1);
  const candidates = preferredSectorIndex == null
    ? EVENT_TEMPLATES
    : EVENT_TEMPLATES.filter((card) => card.sectorIndex === Number(preferredSectorIndex));
  const pool = candidates.length ? candidates : EVENT_TEMPLATES;
  const template = pool[Math.floor(random() * pool.length)];
  const rate = grade.min + random() * (grade.max - grade.min);
  return { ...template, grade: grade.id, rate: Number((rate * template.direction).toFixed(4)), duration: Number(template.duration || 0) };
}
