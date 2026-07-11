const ACTION_COPY = {
  ko: { buy: "매수", sell: "매도", interfere: "견제", defend: "방어", gamble: "도박", "all-in": "올인" },
  en: { buy: "Buy", sell: "Sell", interfere: "Interfere", defend: "Defend", gamble: "Gamble", "all-in": "All In" },
};

export function battleArenaMarkup() {
  return `<section class="battle-arena-panel is-hidden" id="battle-arena-panel" aria-labelledby="battle-arena-title">
    <header><div><span>MOBILE BATTLE LOOP</span><h2 id="battle-arena-title">이번 턴 행동</h2></div><strong id="battle-phase-badge">ACTION</strong></header>
    <div class="battle-stepper" aria-label="턴 진행 단계"><i data-mvp-step="action">1 <b>행동</b></i><i data-mvp-step="dice">2 <b>주사위</b></i><i data-mvp-step="resolved">3 <b>결과</b></i></div>
    <div class="battle-actions" id="battle-actions">
      <button data-mvp-action="buy"><span>＋</span><b>매수</b></button><button data-mvp-action="sell"><span>−</span><b>매도</b></button>
      <button data-mvp-action="interfere"><span>⚡</span><b>방해</b></button><button data-mvp-action="defend"><span>◆</span><b>방어</b></button>
      <button data-mvp-action="gamble"><span>?</span><b>도박</b></button>
    </div>
    <div class="battle-result" id="battle-result"><span>행동 하나를 선택하세요.</span><strong id="battle-die">—</strong></div>
  </section>`;
}

export function renderBattleArena(panel, game, language = "ko") {
  if (!panel) return;
  const mvp = game?.survivalMvp;
  panel.classList.toggle("is-hidden", !mvp);
  if (!mvp) return;
  const copy = ACTION_COPY[language] || ACTION_COPY.ko;
  panel.querySelectorAll("[data-mvp-action]").forEach((button) => {
    if (button.dataset.mvpAction === "all-in") button.classList.toggle("is-hidden", !game.players.find((player) => player.isHuman)?.bankruptcyDanger);
    button.disabled = mvp.phase !== "action";
    button.querySelector("b").textContent = copy[button.dataset.mvpAction];
  });
  panel.querySelectorAll("[data-mvp-step]").forEach((step) => step.classList.toggle("is-active", step.dataset.mvpStep === mvp.phase));
  panel.querySelector("#battle-phase-badge").textContent = mvp.phase.toUpperCase();
  const result = panel.querySelector("#battle-result span");
  const die = panel.querySelector("#battle-die");
  if (mvp.phase === "action") result.textContent = language === "en" ? "Choose one action." : "행동 하나를 선택하세요.";
  else if (mvp.phase === "dice") result.textContent = language === "en" ? "Action locked. Roll the die." : "행동 확정. 주사위를 굴리세요.";
  else result.textContent = language === "en" ? mvp.diceResult?.event?.labelEn : mvp.diceResult?.event?.labelKo;
  die.textContent = mvp.diceResult?.roll || "—";
  const reveal = panel.querySelector("#event-reveal");
  const card = mvp.diceResult?.eventCards?.at(-1) || mvp.skillEventResult?.card;
  reveal.className = `event-reveal ${card ? `grade-${card.grade}` : "is-hidden"}`;
  if (card) {
    panel.querySelector("#event-grade").textContent = card.grade.toUpperCase();
    panel.querySelector("#event-name").textContent = language === "en" ? card.nameEn : card.nameKo;
    panel.querySelector("#event-impact").textContent = `${card.rate >= 0 ? "+" : ""}${(card.rate * 100).toFixed(0)}%`;
  }
}
