// [완료] 서바이벌 밸런스 수치는 화면 코드에 흩어놓지 않고 이 설정에서 관리한다.
export const MVP_RULES = Object.freeze({
  minPlayers: 3,
  maxPlayers: 6,
  totalRounds: 10,
  startingCash: 387,
  survivalIncome: 29,
  companyShareSupply: 21,
  maxHoldingPerCompany: 11,
  maxBuyPerAction: 5,
  interferenceDrop: 0.05,
  interferenceFailRate: 0.3,
  firstPlaceBounty: 10,
  gambleCashRate: 0.3,
  defendEffectMultiplier: 0.5,
});

export const MVP_ACTIONS = Object.freeze(["buy", "sell", "interfere", "defend", "gamble", "all-in"]);
