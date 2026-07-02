const pick = (items, random = Math.random) => items[Math.floor(random() * items.length) % items.length];

function koreanParticle(value, consonant, vowel) {
  const text = String(value || "");
  const code = text.charCodeAt(text.length - 1);
  const hasBatchim = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
  return `${text}${hasBatchim ? consonant : vowel}`;
}

function stockContext(game, speaker, random) {
  const owned = (speaker?.holdings || [])
    .map((quantity, stockIndex) => ({ quantity, stockIndex }))
    .filter((entry) => entry.quantity > 0 && game.stocks[entry.stockIndex]);
  const stockIndex = owned.length && random() < 0.72
    ? pick(owned, random).stockIndex
    : Math.floor(random() * game.stocks.length) % game.stocks.length;
  const stock = game.stocks[stockIndex];
  const currentIndex = Math.max(0, Math.min(stock.prices.length - 1, Number(game.turn || 1) - 1));
  const nextIndex = Math.min(stock.prices.length - 1, currentIndex + 1);
  const actualRise = stock.prices[nextIndex] >= stock.prices[currentIndex];
  const truthful = random() < 0.62;
  return { stock, stockIndex, truthful, claimedRise: truthful ? actualRise : !actualRise };
}

function buildLine(language, context, previousSpeakerName, phase, random) {
  const { stock, truthful, claimedRise } = context;
  const direction = language === "en"
    ? (claimedRise ? "leaning upward" : "looking weak")
    : (claimedRise ? "위로 한번 튈 것 같아" : "아래로 한 번 밀릴 것 같아");
  const directionRumor = claimedRise ? "위쪽이라는" : "아래쪽이라는";
  const stockTopic = koreanParticle(stock.name, "은", "는");
  const stockSubject = koreanParticle(stock.name, "이", "가");
  const uncertainty = language === "en"
    ? pick(["Could be wrong, though.", "Don't bet the house on it.", "That's just my read.", "Take it as noise, not advice."], random)
    : pick(["물론 내 감이 틀릴 수도 있어.", "이거 믿고 몰빵하진 마.", "그냥 내 눈에는 그렇다는 거야.", "정보라기보다 잡음 정도로 들어."], random);
  const name = previousSpeakerName || (language === "en" ? "you" : "아까 말한 사람");

  if (phase > 0) {
    const replies = language === "en" ? [
      `${name}, I checked ${stock.name} again. I actually see it ${direction}. ${uncertainty}`,
      `Not sure I buy that, ${name}. ${stock.name}'s volume feels staged to me.`,
      `I saw the same move, but my conclusion was the opposite. ${stock.name} is ${direction}.`,
      `${name}, was that based on volume or just the last candle? I'm watching ${stock.name} too.`,
      `Now that ${name} sounds confident, I feel less confident. ${stock.name} has trapped me before.`,
      `That tip may already be stale. I heard ${stock.name} is ${direction}, but the source was vague.`,
      `I own some ${stock.name}, so I'm biased. Still, ${direction}. ${uncertainty}`,
      `Wait, are we all looking at the same chart? ${stock.name} doesn't look that clean to me.`,
      `If ${name} is right, I missed the entry. I'm not chasing ${stock.name} here.`,
      `I only put a tiny order on ${stock.name}. Let's see whose story survives the next candle.`,
    ] : [
      `${name}, 나도 ${stock.name} 다시 봤는데 난 ${direction}. ${uncertainty}`,
      `${name}, 그건 좀 과한 해석 아닌가? ${stock.name} 거래량이 일부러 만든 것처럼 보여.`,
      `나도 같은 움직임 봤는데 결론은 반대였어. ${stock.name}, 난 ${direction}.`,
      `${name}, 그 얘기 거래량 보고 한 거야, 마지막 봉만 본 거야? 나도 ${stock.name} 보고 있거든.`,
      `${name} 말이 확신에 차 있으니 오히려 불안한데. 난 ${stock.name}에서 전에 한번 속았어.`,
      `그 정보 이미 늦은 거 아닐까? ${stock.name} 방향이 ${directionRumor} 얘기는 들었는데 출처가 애매해.`,
      `나 ${stock.name} 조금 들고 있어서 객관적이진 않아. 그래도 ${direction}. ${uncertainty}`,
      `잠깐, 우리 같은 차트 보는 거 맞아? ${stock.name} 흐름이 그렇게 깔끔하진 않은데.`,
      `${name} 말이 맞으면 난 진입 놓친 거네. 지금 ${stock.name} 따라가진 않을래.`,
      `${stock.name}은 진짜 소액만 걸었어. 다음 봉에서 누구 말이 맞는지 보자.`,
    ];
    return pick(replies, random);
  }

  const starters = language === "en" ? [
    `Anyone watching ${stock.name}? It looks ${direction}. ${uncertainty}`,
    `${stock.sector} feels different this round. My eye is on ${stock.name}, but I'm keeping the position small.`,
    `I almost cancelled my ${stock.name} order. The chart says ${direction}, my gut says run.`,
    `Someone said larger hands were building ${stock.name}. No idea if that's real, so I only bought a little.`,
    `${stock.name}'s volume woke up before the price did. That usually means something, not always something good.`,
    `I sold ${stock.name} too early last time. Now it looks ${direction}, and I'm trying not to revenge trade.`,
    `This may be nonsense, but the order book around ${stock.name} feels unusually quiet.`,
    `Cash feels comfortable until ${stock.name} starts moving. I'm still waiting one more candle.`,
    `My best trades start boring. ${stock.name} is suddenly not boring, which worries me.`,
    `Market chat says ${stock.name} is ${direction}. Market chat also lies for a living.`,
  ] : [
    `${stock.name} 보는 사람 있어? 난 ${direction}. ${uncertainty}`,
    `이번 턴 ${stock.sector} 분위기가 좀 달라. ${stock.name} 보고 있는데 비중은 작게 갈래.`,
    `${stock.name} 주문 넣었다가 취소할 뻔했어. 차트는 ${direction}는데 내 촉은 도망가래.`,
    `큰손이 ${stock.name} 모은다는 얘기가 있던데 진짜인진 몰라. 그래서 나도 아주 조금만 샀어.`,
    `${stockTopic} 가격보다 거래량이 먼저 깨어났더라. 보통 뭔가 있다는 건데 좋은 건진 모르겠어.`,
    `지난번엔 ${stock.name} 너무 일찍 팔았거든. 지금은 ${direction}는데 복수매매는 참는 중이야.`,
    `헛소문일 수도 있는데 ${stock.name} 주문창이 이상하게 조용해.`,
    `현금 들고 있으면 편한데 ${stock.name} 움직이기 시작하면 또 손이 근질거리지. 한 봉 더 볼래.`,
    `내 좋은 매매는 보통 지루하게 시작해. ${stockSubject} 갑자기 안 지루해서 오히려 걱정이야.`,
    `채팅방에선 ${stock.name} 방향이 ${directionRumor} 얘기가 돌더라. 근데 채팅방 정보가 원래 제일 잘 속이잖아.`,
  ];
  return pick(starters, random);
}

export function createAiChatLine(game, speaker, options = {}) {
  const random = options.random || Math.random;
  const language = options.language === "en" || game.language === "en" ? "en" : "ko";
  let result;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const context = stockContext(game, speaker, random);
    const text = buildLine(language, context, options.previousSpeakerName, Number(options.phase || 0), random);
    result = { ...context, text };
    if (!(options.recentTexts || []).includes(text)) break;
  }
  return result;
}

export function createAiConversationPlan(game, aiPlayers, options = {}) {
  if (!aiPlayers?.length || !game?.stocks?.length) return [];
  const random = options.random || Math.random;
  const desired = Math.max(1, Math.min(Number(options.count || 3), 4));
  const pool = [...aiPlayers].sort(() => random() - 0.5);
  const recentTexts = [...(options.recentTexts || [])];
  const plan = [];
  let previousSpeakerName = options.triggerName || "";
  for (let index = 0; index < desired; index += 1) {
    let speaker = pool[index % pool.length];
    if (plan.length > 0 && speaker.id === plan.at(-1).speaker.id && pool.length > 1) speaker = pool[(index + 1) % pool.length];
    const line = createAiChatLine(game, speaker, {
      language: options.language,
      previousSpeakerName,
      phase: index || options.triggerMessage ? index + 1 : 0,
      recentTexts,
      random,
    });
    plan.push({ speaker, ...line });
    recentTexts.push(line.text);
    previousSpeakerName = speaker.nickname;
  }
  return plan;
}
