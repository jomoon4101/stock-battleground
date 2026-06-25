export const CONFIG = Object.freeze({
  playerCount: 100,
  stockCount: 30,
  totalTurns: 40,
  baseSalary: 1_000_000,
  standardTurnSeconds: 120,
  checkpointBonusSeconds: 300,
  bondTermTurns: 10,
  bondYield: 0.05,
  loanInterest: 0.1,
});

const MARKETS = [
  { code: "US", name: "미국", nameEn: "USA", flag: "🇺🇸", drift: 0.004, volatility: 0.045 },
  { code: "KR", name: "한국", nameEn: "Korea", flag: "🇰🇷", drift: 0.003, volatility: 0.052 },
  { code: "JP", name: "일본", nameEn: "Japan", flag: "🇯🇵", drift: 0.0035, volatility: 0.038 },
  { code: "CN", name: "중국", nameEn: "China", flag: "🇨🇳", drift: 0.002, volatility: 0.058 },
  { code: "EU", name: "유럽", nameEn: "Europe", flag: "🇪🇺", drift: 0.003, volatility: 0.041 },
];

const NAME_PREFIXES = [
  "네온", "오로라", "퀀텀", "블루", "노바", "픽셀", "크레스트", "제로", "루멘", "벡터",
  "아틀라스", "메트로", "젠", "에코", "프라임", "실버", "코어", "스카이", "테라", "하이브",
];
const NAME_SUFFIXES = [
  "랩스", "모터스", "바이오", "에너지", "로직스", "리테일", "로보틱스", "파이낸스", "미디어", "머티리얼",
  "웍스", "네트웍스", "모빌리티", "시스템즈", "푸드", "항공", "테크", "헬스", "디지털", "인더스트리",
];
const NAME_PREFIXES_EN = ["Neon", "Aurora", "Quantum", "Blue", "Nova", "Pixel", "Crest", "Zero", "Lumen", "Vector", "Atlas", "Metro", "Zen", "Echo", "Prime", "Silver", "Core", "Sky", "Terra", "Hive"];
const NAME_SUFFIXES_EN = ["Labs", "Motors", "Bio", "Energy", "Logics", "Retail", "Robotics", "Finance", "Media", "Materials", "Works", "Networks", "Mobility", "Systems", "Foods", "Aero", "Tech", "Health", "Digital", "Industries"];
const BOT_ADJECTIVES = ["고요한", "빠른", "집요한", "푸른", "영리한", "대담한", "차가운", "황금", "느긋한", "행운의"];
const BOT_NOUNS = ["개미", "황소", "곰", "여우", "고래", "매", "토끼", "늑대", "부엉이", "거북이"];
const BOT_ADJECTIVES_EN = ["Quiet", "Swift", "Relentless", "Blue", "Clever", "Bold", "Cold", "Golden", "Patient", "Lucky"];
const BOT_NOUNS_EN = ["Ant", "Bull", "Bear", "Fox", "Whale", "Hawk", "Rabbit", "Wolf", "Owl", "Turtle"];
const ELIMINATION_QUOTES = {
  ko: ["시장은 내일도 열립니다. 살아남은 경험이 최고의 차트입니다.", "손실은 숫자지만 교훈은 자산입니다.", "바닥은 지나고 나서야 보입니다.", "몰빵보다 오래 살아남는 분산이 강합니다.", "좋은 매매는 다음 기회를 남겨둡니다."],
  en: ["The market opens again tomorrow. Experience is your best chart.", "Loss is a number; the lesson is an asset.", "The bottom is only obvious in hindsight.", "Diversification survives longer than conviction alone.", "A good trade always leaves room for the next one."],
};

export function createRng(seed = Date.now()) {
  let state = Number(seed) >>> 0 || 0x6d2b79f5;
  return {
    next() {
      state |= 0;
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(min, max) {
      return Math.floor(this.next() * (max - min + 1)) + min;
    },
    pick(items) {
      return items[Math.floor(this.next() * items.length)];
    },
    get state() {
      return state >>> 0;
    },
  };
}

function normal(rng) {
  const u = Math.max(rng.next(), Number.EPSILON);
  const v = Math.max(rng.next(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function roundPrice(value) {
  return Math.max(100, Math.round(value / 10) * 10);
}

function uniqueCompanyName(index, language = "ko") {
  const prefixes = language === "en" ? NAME_PREFIXES_EN : NAME_PREFIXES;
  const suffixes = language === "en" ? NAME_SUFFIXES_EN : NAME_SUFFIXES;
  const prefix = prefixes[index % prefixes.length];
  const suffix = suffixes[Math.floor(index / prefixes.length) + (index * 7) % suffixes.length];
  return `${prefix} ${suffix}`;
}

function createCandles(closes, market, rng) {
  const baseVolume = rng.int(180_000, 3_800_000);
  return closes.map((close, index) => {
    const previousClose = index > 0 ? closes[index - 1] : close * (0.985 + rng.next() * 0.03);
    const open = roundPrice(previousClose * (0.992 + rng.next() * 0.016));
    const movement = Math.abs(close - open);
    const wick = Math.max(close * (0.004 + rng.next() * market.volatility * 0.65), movement * 0.18);
    const high = roundPrice(Math.max(open, close) + wick * (0.55 + rng.next() * 0.75));
    const low = roundPrice(Math.max(100, Math.min(open, close) - wick * (0.55 + rng.next() * 0.75)));
    const changeRate = Math.abs(close / previousClose - 1);
    const volume = Math.round(baseVolume * (0.55 + rng.next() * 1.05) * (1 + changeRate * 7) / 100) * 100;
    return { open, high: Math.max(high, open, close), low: Math.min(low, open, close), close, volume };
  });
}

function generateStock(index, rng, language = "ko") {
  const market = MARKETS[index % MARKETS.length];
  const base = rng.int(18, 240) * 1_000;
  const historyWithBase = [base];
  for (let point = 0; point < 18; point += 1) {
    const priorChange = market.drift + normal(rng) * market.volatility * 0.7;
    historyWithBase.unshift(roundPrice(historyWithBase[0] / Math.max(0.72, 1 + priorChange)));
  }
  const history = historyWithBase.slice(0, -1);
  const prices = [base];
  const regime = (rng.next() - 0.48) * 0.024;
  const shockTurn = rng.int(5, 37);
  const shock = (rng.next() - 0.52) * 0.24;
  for (let turn = 1; turn <= CONFIG.totalTurns; turn += 1) {
    const cycle = Math.sin((turn + index) / rng.int(4, 9)) * 0.012;
    const event = turn === shockTurn ? shock : 0;
    const change = market.drift + regime + cycle + normal(rng) * market.volatility + event;
    prices.push(roundPrice(prices.at(-1) * Math.max(0.68, 1 + change)));
  }
  const allCandles = createCandles([...history, ...prices], market, rng);
  return {
    id: `STK-${String(index + 1).padStart(2, "0")}`,
    ticker: `${market.code}${String(index + 1).padStart(2, "0")}`,
    name: uniqueCompanyName(index, language),
    market: language === "en" ? { ...market, name: market.nameEn } : market,
    year: rng.int(2001, 2025),
    history,
    historyCandles: allCandles.slice(0, history.length),
    prices,
    candles: allCandles.slice(history.length),
    sector: rng.pick(language === "en" ? ["Tech", "Finance", "Consumer", "Healthcare", "Industrials", "Energy"] : ["테크", "금융", "소비재", "헬스케어", "산업재", "에너지"]),
  };
}

function makePlayer(index, nickname, rng, language = "ko") {
  const isHuman = index === 0;
  const botNumber = String(index).padStart(3, "0");
  const botNickname = language === "en"
    ? `${BOT_ADJECTIVES_EN[index % BOT_ADJECTIVES_EN.length]} ${BOT_NOUNS_EN[Math.floor(index / 3) % BOT_NOUNS_EN.length]} ${botNumber}`
    : `${BOT_ADJECTIVES[index % BOT_ADJECTIVES.length]} ${BOT_NOUNS[Math.floor(index / 3) % BOT_NOUNS.length]} ${botNumber}`;
  return {
    id: isHuman ? "PLAYER-001" : `BOT-${botNumber}`,
    nickname: isHuman ? nickname : botNickname,
    isHuman,
    avatar: { kind: "meme", index: rng.int(0, 9) },
    cash: 0,
    salary: CONFIG.baseSalary,
    debt: 0,
    holdings: Array(CONFIG.stockCount).fill(0),
    bonds: [],
    orders: [],
    frozenTurn: 0,
    tradeLockTurn: 0,
    copiedIdentity: null,
    fakeRank: null,
    eliminated: false,
    eliminatedTurn: null,
    eliminationRank: null,
    eliminationQuote: null,
    performance: [],
    stats: { buys: 0, sells: 0, items: 0, loans: 0, bonds: 0 },
    lastTax: 0,
    lastInterest: 0,
  };
}

export function stockValue(player, stocks, turn) {
  const priceIndex = Math.min(turn - 1, CONFIG.totalTurns);
  return player.holdings.reduce((total, quantity, index) => total + quantity * stocks[index].prices[priceIndex], 0);
}

export function bondValue(player) {
  return player.bonds.reduce((total, bond) => total + bond.principal, 0);
}

export function netWorth(player, stocks, turn) {
  return Math.round(player.cash + stockValue(player, stocks, turn) + bondValue(player) - player.debt);
}

export function taxRateForAssets(assets, salary = CONFIG.baseSalary) {
  if (assets <= 0) return 0.05;
  if (assets < salary * 2) return 0.1;
  if (assets < salary * 5) return 0.15;
  if (assets < salary * 10) return 0.2;
  return 0.3;
}

function paySalary(state, player, reason = "월급") {
  const assets = netWorth(player, state.stocks, state.turn);
  const rate = taxRateForAssets(assets, player.salary);
  const distressMultiplier = assets < 0 ? 0.8 : 1;
  const gross = Math.round(player.salary * distressMultiplier);
  const tax = Math.round(gross * rate);
  player.cash += gross - tax;
  player.lastTax = tax;
  if (player.isHuman) {
    addLog(state, `${reason} ${money(gross)} 지급 · 세금 ${money(tax)} 자동 납부${assets < 0 ? " · 자산 음수 페널티 20%" : ""}`, "income", player.id, { amountDelta: gross - tax });
  }
}

function addLog(state, message, type = "info", playerId = null, meta = {}) {
  state.logs.unshift({ id: `${Date.now()}-${state.logs.length}-${state.turn}`, turn: state.turn, message, type, playerId, ...meta });
  state.logs = state.logs.slice(0, 80);
}

function money(value) {
  const sign = value < 0 ? "-" : "";
  return `${sign}₩${Math.abs(Math.round(value)).toLocaleString("ko-KR")}`;
}

function createRanking(state) {
  return [...state.players]
    .filter((player) => !player.eliminated)
    .map((player) => ({ playerId: player.id, nickname: player.nickname, assets: netWorth(player, state.stocks, state.turn) }))
    .sort((a, b) => b.assets - a.assets)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export function getRanking(state, { display = true, viewerId = "PLAYER-001" } = {}) {
  if (display && state.finished) return state.finalRanking;
  const base = display && state.turn % 10 === 0 && state.rankingSnapshot.length
    ? state.rankingSnapshot.map((entry) => ({ ...entry }))
    : createRanking(state);
  const human = state.players.find((player) => player.id === viewerId) ?? state.players[0];
  if (!display || !human.fakeRank || human.fakeRank.turn !== state.turn) return base;
  const currentIndex = base.findIndex((entry) => entry.playerId === human.id);
  if (currentIndex < 0) return base;
  const [entry] = base.splice(currentIndex, 1);
  base.splice(Math.max(0, Math.min(base.length, human.fakeRank.rank - 1)), 0, entry);
  return base.map((item, index) => ({ ...item, rank: index + 1 }));
}

function recordPerformance(state) {
  const rankMap = new Map(createRanking(state).map((entry) => [entry.playerId, entry.rank]));
  for (const player of state.players) {
    const point = { turn: state.turn, rank: rankMap.get(player.id) ?? player.eliminationRank ?? CONFIG.playerCount, assets: netWorth(player, state.stocks, state.turn) };
    if (player.performance.at(-1)?.turn === state.turn) player.performance[player.performance.length - 1] = point;
    else player.performance.push(point);
  }
}

function eliminateLowest(state) {
  if (state.turn < 11) return null;
  const ranking = createRanking(state);
  const entry = ranking.at(-1);
  if (!entry) return null;
  const player = state.players.find((candidate) => candidate.id === entry.playerId);
  player.eliminated = true;
  player.eliminatedTurn = state.turn;
  player.eliminationRank = entry.rank;
  player.eliminationQuote = ELIMINATION_QUOTES[state.language]?.[(state.turn + entry.rank) % ELIMINATION_QUOTES[state.language].length] ?? ELIMINATION_QUOTES.ko[0];
  addLog(state, `${player.nickname} 플레이어가 ${state.turn}턴에 탈락했습니다.`, "elimination");
  return { playerId: player.id, nickname: player.nickname, turn: state.turn, rank: entry.rank };
}

function textSeed(value) {
  return [...String(value)].reduce((hash, character) => Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0, 2166136261);
}

export function createRumor(state, startTurn = state.turn, recipientId = "PLAYER-001") {
  const currentTurn = Math.max(1, Math.min(CONFIG.totalTurns, Number(startTurn) || state.turn));
  const endTurn = Math.min(CONFIG.totalTurns, currentTurn + 7);
  const rng = createRng(state.seed ^ Math.imul(currentTurn, 2654435761) ^ textSeed(recipientId));
  const candidates = [];
  for (const stock of state.stocks) {
    for (let targetTurn = currentTurn + 1; targetTurn <= endTurn; targetTurn += 1) {
      const current = stock.prices[currentTurn - 1];
      const future = stock.prices[targetTurn - 1];
      const change = future / current - 1;
      candidates.push({ stock, targetTurn, change, score: Math.abs(change) * (0.75 + rng.next() * 0.5) });
    }
  }
  const selected = candidates.sort((a, b) => b.score - a.score)[rng.int(0, Math.min(11, candidates.length - 1))];
  const direction = selected.change >= 0 ? "up" : "down";
  const country = `[${selected.stock.market.name}]`;
  const stockName = `[${selected.stock.name}]`;
  const koUp = [
    `${country} 쪽에서 ${stockName} 물량을 조용히 모은다는 말이 돌아. 며칠 안에 위로 한번 튈 수도 있겠어.`,
    `${country} 시장 아는 형 말로는 ${stockName} 분위기가 슬슬 달아오른대. 너무 늦기 전에 차트는 봐둬.`,
    `${stockName}, ${country} 쪽 큰손들이 눈여겨본다더라. 곧 위쪽으로 꿈틀거릴 수 있다는 얘기야.`,
  ];
  const koDown = [
    `${country} 쪽 ${stockName}에서 물량을 빼는 사람이 있다는 소문이야. 며칠 안에 아래로 흔들릴 수 있어.`,
    `${stockName} 말이야, ${country} 시장에서 분위기가 좀 싸하대. 가까운 시일 안에 밀릴 수도 있으니 조심해.`,
    `${country} 쪽 아는 사람이 ${stockName}은 당분간 무겁다고 하더라. 아래로 한번 꺾일지도 몰라.`,
  ];
  const enUp = [
    `Word is that someone is quietly accumulating ${stockName} over in ${country}. It may pop sometime in the next few days.`,
    `A contact watching ${country} says ${stockName} is starting to warm up. Might be worth keeping the chart open.`,
    `Some bigger hands in ${country} are apparently watching ${stockName}. It could start leaning upward before long.`,
  ];
  const enDown = [
    `Rumor has it that money is slipping out of ${stockName} in ${country}. It may wobble lower in the next few days.`,
    `Something feels off around ${stockName} in ${country}. People say it could get pushed down before long.`,
    `A contact in ${country} says ${stockName} feels heavy. Wouldn't be shocked to see it roll over soon.`,
  ];
  const templates = state.language === "en" ? (direction === "up" ? enUp : enDown) : (direction === "up" ? koUp : koDown);
  return {
    senderId: "RUMOR",
    senderName: state.language === "en" ? "Market Whisper" : "찌라시",
    text: templates[rng.int(0, templates.length - 1)],
    stockIndex: state.stocks.indexOf(selected.stock),
    direction,
    targetTurn: selected.targetTurn,
    startTurn: currentTurn,
    endTurn,
  };
}

export function createGame({ nickname = "플레이어", seed = Date.now(), language = "ko", avatar = null } = {}) {
  const rng = createRng(seed);
  const state = {
    version: 1,
    seed: Number(seed) >>> 0,
    rng,
    turn: 1,
    finished: false,
    language: language === "en" ? "en" : "ko",
    stocks: Array.from({ length: CONFIG.stockCount }, (_, index) => generateStock(index, rng, language)),
    players: Array.from({ length: CONFIG.playerCount }, (_, index) => makePlayer(index, nickname.trim() || "플레이어", rng, language)),
    rankingSnapshot: [],
    finalRanking: [],
    rankBlindTurn: 0,
    logs: [],
    reveal: null,
  };
  if (avatar) state.players[0].avatar = avatar;
  state.players.forEach((player) => paySalary(state, player, "게임 시작 월급"));
  addLog(state, "100명의 참가자가 입장했습니다. 주식 배틀그라운드 시작!", "system");
  recordPerformance(state);
  return state;
}

export function currentPrice(state, stockIndex) {
  return state.stocks[stockIndex].prices[Math.min(state.turn - 1, CONFIG.totalTurns)];
}

export function nextPrice(state, stockIndex) {
  return state.stocks[stockIndex].prices[Math.min(state.turn, CONFIG.totalTurns)];
}

function getPlayer(state, playerId = "PLAYER-001") {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error("플레이어를 찾을 수 없습니다.");
  return player;
}

function ensureTradeAllowed(state, player) {
  if (state.finished) throw new Error("게임이 종료되었습니다.");
  if (player.eliminated) throw new Error("탈락한 플레이어는 거래할 수 없습니다.");
  if (player.frozenTurn === state.turn) throw new Error("이번 턴 거래가 정지되었습니다.");
  if (player.tradeLockTurn === state.turn) throw new Error("랜덤 교체 후 이번 턴에는 거래할 수 없습니다.");
}

function ensureActivePlayer(player) {
  if (player.eliminated) throw new Error("탈락한 플레이어는 더 이상 행동할 수 없습니다.");
}

export function buyStock(state, stockIndex, quantity, playerId) {
  const player = getPlayer(state, playerId);
  ensureTradeAllowed(state, player);
  if (!state.stocks[stockIndex]) throw new Error("종목을 찾을 수 없습니다.");
  const qty = Math.floor(Number(quantity));
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("수량은 1주 이상이어야 합니다.");
  const cost = currentPrice(state, stockIndex) * qty;
  if (player.cash < cost) throw new Error("현금이 부족합니다.");
  player.cash -= cost;
  player.holdings[stockIndex] += qty;
  player.stats.buys += 1;
  if (player.isHuman) addLog(state, `${state.stocks[stockIndex].name} ${qty.toLocaleString()}주 매수`, "buy", player.id, { stockIndex, amountDelta: -cost });
  return cost;
}

export function sellStock(state, stockIndex, quantity, playerId) {
  const player = getPlayer(state, playerId);
  ensureTradeAllowed(state, player);
  if (!state.stocks[stockIndex]) throw new Error("종목을 찾을 수 없습니다.");
  const qty = Math.floor(Number(quantity));
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("수량은 1주 이상이어야 합니다.");
  if (player.holdings[stockIndex] < qty) throw new Error("보유 수량이 부족합니다.");
  const proceeds = currentPrice(state, stockIndex) * qty;
  player.holdings[stockIndex] -= qty;
  player.cash += proceeds;
  player.stats.sells += 1;
  if (player.isHuman) addLog(state, `${state.stocks[stockIndex].name} ${qty.toLocaleString()}주 매도`, "sell", player.id, { stockIndex, amountDelta: proceeds });
  return proceeds;
}

export function placeLimitOrder(state, { stockIndex, quantity, limitPrice, side }, playerId) {
  const player = getPlayer(state, playerId);
  ensureTradeAllowed(state, player);
  if (!state.stocks[stockIndex]) throw new Error("종목을 찾을 수 없습니다.");
  const qty = Math.floor(Number(quantity));
  const price = Math.round(Number(limitPrice));
  if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0) throw new Error("유효한 수량과 예약 가격을 입력하세요.");
  if (!['buy', 'sell'].includes(side)) throw new Error("잘못된 주문 유형입니다.");
  player.orders.push({
    id: `ORD-${state.turn}-${Date.now()}-${player.orders.length}`,
    stockIndex,
    quantity: qty,
    limitPrice: price,
    side,
    createdTurn: state.turn,
  });
  if (player.isHuman) addLog(state, `${state.stocks[stockIndex].name} ${side === "buy" ? "예약매수" : "예약매도"} 등록 · ${qty}주 @ ${money(price)}`, "order", player.id, { stockIndex });
}

export function cancelOrder(state, orderId, playerId) {
  const player = getPlayer(state, playerId);
  ensureActivePlayer(player);
  const index = player.orders.findIndex((order) => order.id === orderId);
  if (index < 0) throw new Error("예약 주문을 찾을 수 없습니다.");
  player.orders.splice(index, 1);
}

function executeOrders(state, player) {
  const remaining = [];
  for (const order of player.orders) {
    if (order.createdTurn >= state.turn) {
      remaining.push(order);
      continue;
    }
    const price = currentPrice(state, order.stockIndex);
    const triggered = order.side === "buy" ? price <= order.limitPrice : price >= order.limitPrice;
    if (!triggered) {
      remaining.push(order);
      continue;
    }
    const total = price * order.quantity;
    if (order.side === "buy" && player.cash >= total) {
      player.cash -= total;
      player.holdings[order.stockIndex] += order.quantity;
      if (player.isHuman) addLog(state, `${state.stocks[order.stockIndex].name} 예약매수 체결 · ${order.quantity}주`, "buy", player.id, { stockIndex: order.stockIndex, amountDelta: -total });
    } else if (order.side === "sell" && player.holdings[order.stockIndex] >= order.quantity) {
      player.cash += total;
      player.holdings[order.stockIndex] -= order.quantity;
      if (player.isHuman) addLog(state, `${state.stocks[order.stockIndex].name} 예약매도 체결 · ${order.quantity}주`, "sell", player.id, { stockIndex: order.stockIndex, amountDelta: total });
    } else {
      remaining.push(order);
    }
  }
  player.orders = remaining;
}

export function borrow(state, amount, playerId) {
  const player = getPlayer(state, playerId);
  ensureActivePlayer(player);
  const value = Math.floor(Number(amount));
  if (!Number.isFinite(value) || value <= 0) throw new Error("대출 금액을 입력하세요.");
  if (netWorth(player, state.stocks, state.turn) < 0) throw new Error("자산이 음수이면 신규 대출을 받을 수 없습니다.");
  const limit = player.salary * 10;
  if (player.debt + value > limit) throw new Error(`대출 한도는 ${money(limit)}입니다.`);
  const upfrontInterest = Math.round(value * CONFIG.loanInterest);
  player.debt += value;
  player.cash += value - upfrontInterest;
  player.stats.loans += 1;
  player.lastInterest = upfrontInterest;
  if (player.isHuman) addLog(state, `대출 ${money(value)} 실행 · 선이자 ${money(upfrontInterest)} 차감`, "loan", player.id, { amountDelta: value - upfrontInterest });
  return { value, upfrontInterest };
}

export function repay(state, amount, playerId) {
  const player = getPlayer(state, playerId);
  ensureActivePlayer(player);
  const value = Math.min(player.debt, Math.floor(Number(amount)));
  if (!Number.isFinite(value) || value <= 0) throw new Error("상환 금액을 입력하세요.");
  if (player.cash < value) throw new Error("상환할 현금이 부족합니다.");
  player.cash -= value;
  player.debt -= value;
  if (player.isHuman) addLog(state, `대출 ${money(value)} 상환`, "loan", player.id, { amountDelta: -value });
  return value;
}

export function buyBond(state, amount, playerId) {
  const player = getPlayer(state, playerId);
  ensureTradeAllowed(state, player);
  const principal = Math.floor(Number(amount));
  if (!Number.isFinite(principal) || principal < 100_000) throw new Error("채권은 10만원 이상 구매할 수 있습니다.");
  if (player.cash < principal) throw new Error("현금이 부족합니다.");
  player.cash -= principal;
  player.stats.bonds += 1;
  player.bonds.push({
    id: `BOND-${state.turn}-${Date.now()}-${player.bonds.length}`,
    principal,
    purchasedTurn: state.turn,
    maturityTurn: state.turn + CONFIG.bondTermTurns,
    rate: CONFIG.bondYield,
  });
  if (player.isHuman) addLog(state, `10턴 만기 채권 ${money(principal)} 매수 · 만기수익 5%`, "bond", player.id, { amountDelta: -principal });
}

function matureBonds(state, player) {
  const active = [];
  for (const bond of player.bonds) {
    if (bond.maturityTurn <= state.turn) {
      const payout = Math.round(bond.principal * (1 + bond.rate));
      player.cash += payout;
      if (player.isHuman) addLog(state, `채권 만기 입금`, "income", player.id, { amountDelta: payout });
    } else {
      active.push(bond);
    }
  }
  player.bonds = active;
}

export const SPECIAL_ITEMS = [
  { id: "future-price", name: "미래 시세", description: "선택 종목의 다음 턴 가격 공개", rate: 0.2 },
  { id: "rising-stock", name: "상승 레이더", description: "다음 턴 상승 종목 1개 공개", rate: 0.2 },
  { id: "falling-stock", name: "하락 레이더", description: "다음 턴 하락 종목 1개 공개", rate: 0.2 },
  { id: "rank-blackout", name: "전파 방해", description: "이번 턴 전체 순위 차트 차단", rate: 0.1 },
  { id: "identity-copy", name: "신분 위장", description: "선택 플레이어의 ID·닉네임을 이번 턴 복사", rate: 0.1 },
  { id: "fake-rank", name: "순위 조작", description: "이번 턴 표시 순위를 원하는 위치로 변경", rate: 0.1 },
  { id: "trade-freeze", name: "거래 정지", description: "선택 플레이어의 이번 턴 수동 거래 정지", rate: 0.3 },
];

export const RANDOM_ITEMS = [
  { id: "salary-roll", name: "연봉 룰렛", description: "월급을 현재의 30~150%로 변경" },
  { id: "portfolio-shuffle", name: "포트폴리오 셔플", description: "모든 주식을 무작위 종목으로 교체하고 이번 턴 거래 잠금" },
];

function chargeItemCost(state, player, rate) {
  const assets = netWorth(player, state.stocks, state.turn);
  if (assets < player.salary * 10) throw new Error("특별 아이템은 자산이 월급의 10배 이상일 때 구매할 수 있습니다.");
  const cost = Math.max(0, Math.round(assets * rate));
  if (player.cash < cost) throw new Error(`아이템 비용 ${money(cost)}을 낼 현금이 부족합니다.`);
  player.cash -= cost;
  return cost;
}

export function useSpecialItem(state, itemId, options = {}, playerId) {
  const player = getPlayer(state, playerId);
  ensureActivePlayer(player);
  const item = SPECIAL_ITEMS.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error("아이템을 찾을 수 없습니다.");
  if (state.finished) throw new Error("게임이 종료되었습니다.");
  if (["future-price", "rising-stock", "falling-stock"].includes(itemId) && state.turn >= CONFIG.totalTurns) {
    throw new Error("마지막 턴에는 다음 턴 정보 아이템을 사용할 수 없습니다.");
  }
  if (itemId === "trade-freeze" && state.turn === CONFIG.totalTurns) throw new Error("마지막 턴에는 거래 정지를 사용할 수 없습니다.");

  let prepared = {};
  if (itemId === "future-price") {
    const index = Number(options.stockIndex);
    if (!state.stocks[index]) throw new Error("종목을 선택하세요.");
    prepared = { stockIndex: index, price: nextPrice(state, index) };
  } else if (itemId === "rising-stock" || itemId === "falling-stock") {
    const candidates = state.stocks
      .map((stock, index) => ({ stock, index, delta: nextPrice(state, index) - currentPrice(state, index) }))
      .filter((entry) => itemId === "rising-stock" ? entry.delta > 0 : entry.delta < 0);
    const chosen = state.rng.pick(candidates.length ? candidates : state.stocks.map((stock, index) => ({ stock, index, delta: 0 })));
    prepared = { stockIndex: chosen.index };
  } else if (itemId === "rank-blackout") {
    prepared = { turn: state.turn };
  } else if (itemId === "identity-copy") {
    const target = getPlayer(state, options.targetId);
    if (target.id === player.id) throw new Error("자기 자신은 복사할 수 없습니다.");
    prepared = { turn: state.turn, id: target.id, nickname: target.nickname };
  } else if (itemId === "fake-rank") {
    const rank = Math.floor(Number(options.rank));
    if (rank < 1 || rank > CONFIG.playerCount) throw new Error("순위는 1~100 사이여야 합니다.");
    prepared = { turn: state.turn, rank };
  } else if (itemId === "trade-freeze") {
    const target = getPlayer(state, options.targetId);
    if (target.id === player.id) throw new Error("자기 자신은 정지시킬 수 없습니다.");
    prepared = { targetId: target.id };
  }

  const cost = chargeItemCost(state, player, item.rate);
  player.stats.items += 1;
  if (itemId === "rank-blackout") state.rankBlindTurn = state.turn;
  if (itemId === "identity-copy") player.copiedIdentity = prepared;
  if (itemId === "fake-rank") player.fakeRank = prepared;
  if (itemId === "trade-freeze") getPlayer(state, prepared.targetId).frozenTurn = state.turn;
  state.reveal = { turn: state.turn, itemId, playerId: player.id, ...prepared };
  addLog(state, `${item.name} 사용`, "item", player.id, { amountDelta: -cost });
  return { cost, ...prepared };
}

export function useRandomItem(state, itemId, playerId) {
  const player = getPlayer(state, playerId);
  ensureActivePlayer(player);
  if (netWorth(player, state.stocks, state.turn) < player.salary * 2) {
    throw new Error("랜덤 아이템은 자산이 월급의 2배 이상일 때 구매할 수 있습니다.");
  }
  const cost = player.salary;
  if (player.cash < cost) throw new Error(`아이템 비용 ${money(cost)}을 낼 현금이 부족합니다.`);
  player.cash -= cost;
  player.stats.items += 1;
  let result;
  if (itemId === "salary-roll") {
    const ratio = 0.3 + state.rng.next() * 1.2;
    const previousSalary = player.salary;
    player.salary = Math.max(100_000, Math.round((player.salary * ratio) / 10_000) * 10_000);
    result = { previousSalary, salary: player.salary, ratio };
  } else if (itemId === "portfolio-shuffle") {
    const value = stockValue(player, state.stocks, state.turn);
    player.holdings.fill(0);
    let budget = value;
    const count = Math.min(state.stocks.length, state.rng.int(2, 5));
    const selected = new Set();
    while (selected.size < count) selected.add(state.rng.int(0, state.stocks.length - 1));
    [...selected].forEach((stockIndex, index) => {
      const allocation = index === selected.size - 1 ? budget : Math.round(budget * (0.25 + state.rng.next() * 0.25));
      const qty = Math.floor(allocation / currentPrice(state, stockIndex));
      player.holdings[stockIndex] += qty;
      budget -= qty * currentPrice(state, stockIndex);
    });
    player.cash += Math.max(0, budget);
    player.tradeLockTurn = state.turn;
    result = { count: selected.size };
  } else {
    player.cash += cost;
    throw new Error("랜덤 아이템을 찾을 수 없습니다.");
  }
  addLog(state, `${RANDOM_ITEMS.find((item) => item.id === itemId)?.name ?? "랜덤 아이템"} 사용`, "item", player.id, { amountDelta: -cost });
  return { cost, ...result };
}

function botAction(state, player) {
  if (player.frozenTurn === state.turn || player.tradeLockTurn === state.turn) return;
  const worth = netWorth(player, state.stocks, state.turn);
  if (state.turn < 25 && player.debt === 0 && state.rng.next() < 0.07 && worth >= 0) {
    const amount = Math.round((player.salary * state.rng.int(2, 7)) / 100_000) * 100_000;
    try { borrow(state, amount, player.id); } catch { /* bot skips */ }
  }

  const owned = player.holdings.map((qty, index) => ({ qty, index })).filter((entry) => entry.qty > 0);
  if (owned.length && state.rng.next() < 0.32) {
    const target = state.rng.pick(owned);
    const qty = Math.max(1, Math.floor(target.qty * (0.2 + state.rng.next() * 0.5)));
    try { sellStock(state, target.index, qty, player.id); } catch { /* bot skips */ }
  }

  if (state.rng.next() < 0.12 && player.cash > 300_000) {
    try { buyBond(state, Math.min(player.cash * 0.25, player.salary), player.id); } catch { /* bot skips */ }
  }

  const candidates = state.stocks.map((stock, index) => {
    const momentum = state.turn > 1 ? currentPrice(state, index) / stock.prices[Math.max(0, state.turn - 2)] - 1 : 0;
    return { index, score: momentum + normal(state.rng) * 0.08 };
  }).sort((a, b) => b.score - a.score).slice(0, 8);
  const target = state.rng.pick(candidates);
  const budget = Math.max(0, player.cash * (0.25 + state.rng.next() * 0.5));
  const qty = Math.floor(budget / currentPrice(state, target.index));
  if (qty > 0) {
    try { buyStock(state, target.index, qty, player.id); } catch { /* bot skips */ }
  }
}

function checkpoint(state) {
  for (const player of state.players) {
    if (player.eliminated) continue;
    if (player.debt > 0) {
      const distress = netWorth(player, state.stocks, state.turn) < 0;
      const rate = CONFIG.loanInterest + (distress ? 0.05 : 0);
      const interest = Math.round(player.debt * rate);
      player.cash -= interest;
      player.lastInterest = interest;
      if (player.isHuman) addLog(state, `10턴 대출이자 납부${distress ? " · 자산 음수 가산 5%" : ""}`, "loan", player.id, { amountDelta: -interest });
    }
    paySalary(state, player, `${state.turn}턴 월급`);
  }
}

export function advanceTurn(state) {
  if (state.finished) throw new Error("게임이 종료되었습니다.");

  for (const player of state.players.filter((player) => !player.isHuman && !player.eliminated)) botAction(state, player);
  state.rankingSnapshot = createRanking(state);

  if (state.turn === CONFIG.totalTurns) {
    checkpoint(state);
    state.finished = true;
    const active = createRanking(state);
    const eliminated = state.players.filter((player) => player.eliminated)
      .sort((a, b) => (b.eliminatedTurn - a.eliminatedTurn) || (b.eliminationRank - a.eliminationRank))
      .map((player) => ({ playerId: player.id, nickname: player.nickname, assets: netWorth(player, state.stocks, state.turn) }));
    state.finalRanking = [...active, ...eliminated].map((entry, index) => ({ ...entry, rank: index + 1 }));
    recordPerformance(state);
    addLog(state, "40턴 종료. 최종 순위가 확정되었습니다.", "system");
    return { finished: true, ranking: state.finalRanking };
  }

  if (state.turn % 10 === 0) checkpoint(state);
  state.turn += 1;
  state.reveal = null;
  state.players.filter((player) => !player.eliminated).forEach((player) => {
    matureBonds(state, player);
    executeOrders(state, player);
  });
  const eliminated = eliminateLowest(state);
  recordPerformance(state);
  addLog(state, `${state.turn}턴 시작`, "turn");
  return { finished: false, turn: state.turn, eliminated };
}

export function turnDurationSeconds(turn, speed = "standard") {
  if (speed === "test") return 1;
  if (speed === "turbo") return turn % 10 === 0 ? 75 : 21;
  if (speed === "fast") return turn % 10 === 0 ? 189 : 54;
  return CONFIG.standardTurnSeconds + (turn % 10 === 0 ? CONFIG.checkpointBonusSeconds : 0);
}

export function getPlayerSummary(state, playerId) {
  const player = getPlayer(state, playerId);
  const stocks = stockValue(player, state.stocks, state.turn);
  const bonds = bondValue(player);
  const assets = netWorth(player, state.stocks, state.turn);
  return {
    cash: Math.round(player.cash),
    stocks: Math.round(stocks),
    bonds: Math.round(bonds),
    debt: Math.round(player.debt),
    assets,
    salary: Math.round(player.salary),
    taxRate: taxRateForAssets(assets, player.salary),
    specialEligible: assets >= player.salary * 10,
    randomEligible: assets >= player.salary * 2,
  };
}
