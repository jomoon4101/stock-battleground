export const DICE_EVENTS = Object.freeze({
  1: Object.freeze({ id: "personal-drop", labelKo: "개인 악재", labelEn: "Personal setback", direction: -1, rate: 0.04, scope: "holding" }),
  2: Object.freeze({ id: "market-dip", labelKo: "시장 소폭 하락", labelEn: "Market dip", direction: -1, rate: 0.05, scope: "market" }),
  3: Object.freeze({ id: "survival-bonus", labelKo: "생존 지원금", labelEn: "Survival support", cash: 29, scope: "cash" }),
  4: Object.freeze({ id: "market-rise", labelKo: "시장 소폭 상승", labelEn: "Market rise", direction: 1, rate: 0.04, scope: "market" }),
  5: Object.freeze({ id: "personal-rise", labelKo: "주력 섹터 상승", labelEn: "Core sector rise", direction: 1, rate: 0.07, scope: "holding" }),
  6: Object.freeze({ id: "event-card", labelKo: "특별 이벤트", labelEn: "Event card", direction: 1, rate: 0.1, scope: "random" }),
});

export function eventForRoll(roll) {
  const value = Math.max(1, Math.min(6, Math.floor(Number(roll) || 1)));
  return DICE_EVENTS[value];
}
