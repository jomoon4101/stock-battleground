let language = "ko";
const textOriginals = new WeakMap();
const attributeOriginals = new WeakMap();

const EN = {
  "주문 열기": "Open order", "턴 행동": "Turn actions",
  "프로필": "Profile", "프로필 선택": "Choose profile", "아이콘을 눌러 변경하거나 사진을 올리세요": "Tap the icon to choose or upload a photo", "게임에서 사용할 프로필을 선택하세요.": "Choose the profile used in the game.", "내 사진 업로드": "Upload my photo", "선택 완료": "Done", "종목 상세": "Stock details", "바로 매수": "Buy now", "바로 매도": "Sell now", "일반 라운드 · 제한시간": "Live round · Time limit", "블라인드 라운드 · 추가 시간": "Blind round · Bonus time",
  "주식": "STOCK", "서바이벌": "SURVIVAL", "시장을 읽고, 자산을 숨기고, 마지막 벨까지 살아남으세요.": "Read the market, protect your assets, and survive until the final bell.",
  "빈자리는 최대 29명의 AI 트레이더가 채웁니다.": "Up to 29 AI traders fill every remaining seat.", "트레이더 닉네임": "Trader nickname", "게임 모드": "Game mode",
  "프로필 이미지": "Profile image", "사진 업로드": "Upload photo", "공식 게임": "Official", "빠른 게임": "Fast", "터보 게임": "Turbo", "약 60분": "About 60 min", "약 27분": "About 27 min", "약 11분": "About 11 min",
  "멀티게임": "MULTIPLAYER", "방 만들기": "Create room", "방 코드 6자리": "6-digit room code", "방 참가": "Join room", "혼자서 테스트하기": "Solo test",
  "정보는 힘이다, 전략은 생존이다!": "Information is power. Strategy is survival!", "실전 투자 감각을 게임처럼 배우는 주식 생존 시뮬레이션": "A stock survival simulation that builds market instincts through play.",
  "시장 분석": "Market analysis", "최신 이슈": "Latest issues", "투자 전략": "Investment strategy", "실전 노하우": "Practical know-how", "종목 정보": "Stock intelligence", "섹터 정보": "Sector intelligence", "생존 구역": "Survival zones", "커뮤니티": "Community", "정보 교류": "Intel exchange",
  "기본 게임": "Standard game", "장기 게임": "Long game", "10라운드": "10 rounds", "20라운드": "20 rounds", "30라운드": "30 rounds", "생존 인원": "Survivors", "투자 구역 난이도": "Market-zone difficulty", "쉬움 · 5종목": "Easy · 5 stocks", "보통 · 8종목": "Normal · 8 stocks", "어려움 · 10종목": "Hard · 10 stocks",
  "3명 · 10라운드 · 5섹터": "3 players · 10 rounds · 5 sectors", "5명 · 20라운드 · 8섹터": "5 players · 20 rounds · 8 sectors", "7명 · 30라운드 · 11섹터": "7 players · 30 rounds · 11 sectors",
  "다음 라운드까지 살아남으세요": "Survive the next round", "차트와 정보를 읽고 위험 구역을 피해 생존 자산을 지키세요.": "Read charts and intelligence, avoid danger zones, and protect your survival assets.", "정보마다 속도와 신뢰도가 다릅니다": "Every source has different speed and reliability", "시장 정보, 분석 리포트, 미확인 첩보를 비교해 행동을 선택하세요.": "Compare market news, analyst reports, and unverified tips before acting.", "마지막 생존자가 승리합니다": "The last survivor wins", "최대 라운드 또는 최후의 한 명이 남으면 게임이 종료됩니다.": "The game ends at the round limit or when only one survivor remains.",
  "주요 기능": "Key features", "투자 구역": "Investment zone", "행동 선택": "Choose action", "현재 라운드": "Current round", "생존 자산": "Survival assets", "보유 현금": "Cash", "생존 위험도": "Survival risk", "남은 시간": "Time left", "진행 방식": "Game flow", "무제한": "No limit", "순수 턴제 · 시간 무제한": "Turn based · No time limit", "턴 종료 시 다음 라운드 진행": "Advance when you end turn", "턴 종료": "End turn", "행동 완료": "Finish actions", "현재 선택 종목": "Selected stock", "섹터": "Sector", "내 보유 수량": "Owned shares", "평균 매수가": "Average price", "평가 손익": "Unrealized P/L", "내 보유 종목": "My holdings", "생존 정보 센터": "Survival intelligence", "쪽지함 열기 →": "Open mailbox →", "게임 로그": "Game log",
  "3~6명 · 3가지 모드": "3–6 players · 3 game modes", "빠른 게임 10라운드, 기본 게임 20라운드, 장기 게임 30라운드입니다.": "Quick has 10 rounds, Standard has 20, and Long has 30.",
  "3~7명 · 3가지 자동 모드": "3–7 players · 3 automatic modes", "빠른 게임은 3명·10라운드·5섹터, 기본 게임은 5명·20라운드·8섹터, 장기 게임은 7명·30라운드·11섹터입니다.": "Quick uses 3 players, 10 rounds and 5 sectors; Standard uses 5, 20 and 8; Long uses 7, 30 and all 11 sectors.",
  "🔥 서바이벌 진행중": "🔥 SURVIVALS IN PROGRESS", "현재 진행 중인 서바이벌이 없습니다.": "There are no survival games in progress.", "목록 새로고침": "Refresh list", "바로 참여": "Join now", "진행중": "In progress",
  "본 서비스는 가상 주식 시뮬레이션 게임이며, 실제 투자 자문이나 금융 거래 서비스를 제공하지 않습니다.": "This is a virtual stock simulation game. It does not provide investment advice or real financial transaction services.",
  "일개미(개발자)에게 일시키기": "Put the worker ant (developer) to work", "익명 게시판 →": "Anonymous board →", "매 10턴은 블라인드 라운드": "Every 10th turn is blind", "순위가 잠기고 추가 5분이 주어집니다.": "Rankings lock and extra time is added.",
  "정보도 자산입니다": "Information is an asset", "미래 가격과 타인의 행동을 아이템으로 통제하세요.": "Use items to control future information and rival actions.", "25턴 뒤 최후의 생존자": "Last survivor after 25 turns", "순자산이 가장 많은 플레이어가 승리합니다.": "The trader with the highest net worth wins.", "명예의 전당": "Hall of Fame",
  "플레이어 대기실": "Player Lobby", "친구에게 아래 방 코드를 알려주세요. 방장이 시작하면 남은 자리는 AI가 채웁니다.": "Share the room code. AI fills the remaining seats when the host starts.", "서버 연결됨": "Server connected", "나가기": "Leave", "AI를 채우고 게임 시작": "Fill with AI and start", "방장이 게임 시작을 준비하고 있습니다.": "The host is preparing the match.",
  "플레이어를 찾고 있습니다": "Finding players", "5초 뒤 빈자리는 AI 트레이더가 채웁니다.": "AI traders fill empty seats after 5 seconds.", "매칭 취소": "Cancel matchmaking",
  "일반 라운드": "Standard round", "순위 차트 블라인드": "Ranking chart blinded", "이 라운드에는 직전 턴의 순위와 자산만 표시됩니다.": "Only the previous turn's rank and assets are shown.", "익명 종목": "Anonymous stocks", "종목 검색": "Search stocks", "전체 시장": "All markets", "미국": "USA", "한국": "Korea", "일본": "Japan", "중국": "China", "유럽": "Europe", "종목": "Stock", "현재가": "Price", "변동": "Change",
  "선차트": "Line", "봉차트": "Candles", "시가": "Open", "최고": "High", "최저": "Low", "거래량": "Volume", "보유": "Owned", "즉시 거래": "Instant trade", "예약 주문": "Limit orders", "대출·채권": "Loan & bonds", "아이템": "Items", "매수": "Buy", "매도": "Sell", "주문 수량": "Quantity", "최대": "MAX", "예상 주문 금액": "Estimated total", "매수 주문": "Buy order", "매도 주문": "Sell order",
  "대출 잔액": "Loan balance", "보유 채권": "Bonds", "대출": "Borrow", "상환": "Repay", "채권 매수": "Buy bond", "특별 아이템": "Special items", "랜덤 아이템": "Random items", "실시간 기록": "Live activity",
  "내 자산": "My assets", "보유 종목 보기 →": "View portfolio →", "현금": "Cash", "목록 보기": "View list", "채권": "Bonds", "월급": "Salary", "예상 세율": "Estimated tax", "생존 순위": "Survival ranking", "실시간 자산 순위": "Live net worth ranking", "플레이어 검색": "Search players", "순위 / 플레이어": "Rank / Player", "순자산": "Net worth", "현재 순위": "Current rank", "다른 섹터 선택": "Choose another sector", "거래할 섹터를 선택하세요.": "Choose the sector you want to trade.", "내 목표": "My goal",
  "게임 규칙": "Game rules", "아이템 사용": "Use item", "예상 비용": "Estimated cost", "구매하고 사용": "Buy and use", "게임 종료": "Game over", "최종 순위": "Final rank", "새 게임 시작": "Start new game", "플레이어 정보": "Player details", "가장 많이 보유한 종목": "Largest holding", "보유 종목 없음": "No holdings yet", "연속 자산 상승 기록이 없습니다.": "No consecutive asset gains.", "현재 순자산": "Current net worth", "쪽지 보내기": "Send message", "턴별 순위": "Rank by turn", "자산 등락": "Asset change",
  "쪽지함": "Mailbox", "쪽지 내용을 입력하세요": "Write a message", "전송": "Send", "알림": "Notifications", "일개미에게 일시키기": "Put the worker ant to work", "개발자에게 시킬 일을 익명으로 남겨주세요.": "Leave an anonymous task for the developer.", "익명 등록": "Post anonymously", "시장에서 탈락했습니다": "You were eliminated", "탈락 순위": "Elimination rank", "남은 게임 관전하기": "Observe the remaining game", "내 보유 주식": "My holdings", "총 주식 평가액": "Total stock value", "주문을 마무리하세요": "Finish your orders",
  "닫기": "Close", "새 게임": "New game", "일시정지": "Pause", "규칙": "Rules", "게임 규칙": "Game rules",
  "테크": "Tech", "금융": "Finance", "소비재": "Consumer", "헬스케어": "Healthcare", "산업재": "Industrials", "에너지": "Energy",
  "정보기술": "Information Technology", "경기소비재": "Consumer Discretionary", "필수소비재": "Consumer Staples", "커뮤니케이션 서비스": "Communication Services", "원자재": "Materials", "유틸리티": "Utilities", "부동산": "Real Estate",
  "주식 섹터": "Stock sectors", "섹터·회사 검색": "Search sectors or companies", "섹터": "Sector", "수익성": "Return", "안정성": "Stability", "변동성": "Volatility",
  "고수익 고위험 성장 섹터": "High-return, high-risk growth sector", "금리와 경기 흐름에 강한 섹터": "Driven by rates and the business cycle", "안정적이지만 이벤트 리스크가 있는 섹터": "Defensive with event-driven risk", "호황에는 강하고 불황에는 약한 섹터": "Strong in booms and weak in downturns", "수익은 낮지만 생존력이 높은 섹터": "Lower return with strong survivability", "경기 회복기에 강한 실물경제 섹터": "A real-economy sector that benefits from recovery", "광고와 콘텐츠 흐름에 민감한 섹터": "Sensitive to advertising and content cycles", "가격 변동에 따라 크게 움직이는 섹터": "Moves sharply with commodity prices", "유가에 따라 폭등·폭락하는 섹터": "Surges and crashes with energy prices", "방어력은 높지만 성장성은 낮은 섹터": "Highly defensive with low growth", "금리에 민감한 자산형 섹터": "An asset sector sensitive to interest rates",
  "프로토타입 시세는 실제 기업을 노출하지 않는 합성 섹터 패턴입니다. 섹터별 수익성·안정성·변동성을 조합해 매 게임 새로 생성됩니다.": "Prototype prices use synthetic sector patterns without exposing real companies. Each game combines sector-specific return, stability and volatility.",
};

Object.assign(EN, {
  "홈": "Home", "시장": "Market", "거래": "Trade", "생존자": "Survivors", "로그": "Log", "게임 메뉴": "Game menu",
  "거래장 열기": "Open Trade Desk", "보유 종목 없음": "No holdings yet", "시장 스캔에서 첫 종목을 선택하세요.": "Choose your first stock from Market Scan.", "현재 열린 생존전이 없습니다.": "No survival match is open right now.",
  "전체 채팅 열기": "Open room chat", "전체 채팅 닫기": "Close room chat", "생존 상태바": "Survival status", "안전": "Safe",
  "섹터 카드 이동": "Sector card navigation", "이전 섹터": "Previous sector", "다음 섹터": "Next sector", "거래 섹터 선택": "Choose trading sector", "선택 섹터 CEO": "Selected sector CEO",
  "생존 거래를 시작하세요": "Start survival trading", "섹터를 확인하세요.": "Review the sectors.", "종목을 매수/매도하세요.": "Buy or sell a stock.", "턴을 종료하세요.": "End your turn.", "마지막까지 생존하세요.": "Survive to the end.", "게임 시작": "Start game",
  "찌라시 쪽지함 →": "Open rumor inbox →", "방 코드 보기·복사": "View or copy room code", "거래창 열기": "Open trading window",
  "종목명을 누르면 차트로 이동합니다. 매수·매도 버튼을 누르면 해당 주문 화면이 바로 열립니다.": "Tap a stock name to view its chart. Use Buy or Sell to open that order screen.",
  "서버 시뮬레이션 준비": "Server simulation ready", "클릭해서 복사": "Click to copy", "시장 필터": "Market filter", "주식 종목": "Stock list", "선택한 종목의 가격 차트": "Selected stock price chart",
  "현재 T01": "Current T01", "수량": "Quantity", "목표 가격": "Target price", "예약 매수": "Limit buy", "예약 매도": "Limit sell", "예약 등록": "Place limit order",
  "예약 주문은 다음 턴부터 조건 충족 시 체결되며, 거래 정지 아이템의 영향을 받지 않습니다.": "Limit orders can fill from the next turn and are not affected by a trading freeze.",
  "한도: 월급의 10배 · 선이자 10%": "Limit: 10× salary · 10% upfront interest", "10턴 만기 · 확정 수익 5%": "10-turn maturity · fixed 5% return",
  "자산 ≥ 월급 × 10": "Assets ≥ salary × 10", "자산 ≥ 월급 × 2": "Assets ≥ salary × 2", "내 프로필": "My profile", "주식": "Stocks",
  "25턴 · 3가지 모드": "25 turns · 3 modes", "터보 약 11분, 빠른 게임 27분, 공식 게임 60분입니다. 모든 모드의 게임 규칙은 같습니다.": "Turbo is about 11 min, Fast is 27 min, and Official is 60 min. Every mode uses the same rules.",
  "월급과 세금": "Salary and tax", "시작 및 10턴 종료마다 월급을 받습니다. 순자산 구간에 따라 5~30%가 자동 납부됩니다.": "Salary is paid at the start and after every 10 turns. A 5–30% tax is automatically deducted by net-worth bracket.",
  "월급의 10배까지 가능합니다. 실행 즉시 선이자 10%, 10턴마다 이자 10%가 발생합니다.": "You may borrow up to 10× salary. A 10% upfront charge and 10% interest every 10 turns apply.",
  "최소 10만원, 10턴 만기, 확정 수익 5%입니다. 원금은 순자산에 포함됩니다.": "Minimum $66.67, 10-turn maturity, fixed 5% return. Principal counts toward net worth.",
  "블라인드 턴": "Blind turns", "10·20턴에는 직전 턴 순위와 자산만 보입니다. 아이템으로도 차단할 수 있습니다.": "On turns 10 and 20, only the previous turn's rank and assets are visible. Items can also block rankings.",
  "음수 자산": "Negative assets", "신규 대출과 아이템이 막히며 월급 20% 감소, 정기 대출이자 5% 가산 페널티가 적용됩니다.": "New loans and items are blocked, salary falls 20%, and periodic loan interest gains a 5% penalty.",
  "프로토타입의 시세는 실제 기업을 노출하지 않는 합성 역사 패턴입니다. 국가별 변동성·추세·충격 구간을 조합해 매 게임 새로 생성됩니다.": "Prototype prices are synthetic historical patterns that do not expose real companies. Each game combines regional volatility, trends and shock periods.",
  "보유 종목 · 클릭해서 차트 보기": "Holdings · click to view chart", "현재 공개할 주식 포지션이 없습니다.": "There are no stock positions to display.", "평가액": "Value", "보유 수량": "Owned quantity", "주문 가능 현금": "Available cash",
  "취소": "Cancel", "예약 취소": "Cancel limit order", "자산의": "of assets", "현재 월급 1회분": "one current salary payment",
  "미래 시세": "Future price", "선택 종목의 다음 턴 가격 공개": "Reveal the selected stock's next-turn price", "상승 레이더": "Rising radar", "다음 턴 상승 종목 1개 공개": "Reveal one stock that rises next turn",
  "하락 레이더": "Falling radar", "다음 턴 하락 종목 1개 공개": "Reveal one stock that falls next turn", "전파 방해": "Signal blackout", "이번 턴 전체 순위 차트 차단": "Block the ranking chart for this turn",
  "신분 위장": "Identity copy", "선택 플레이어의 ID·닉네임을 이번 턴 복사": "Copy a player's ID and nickname for this turn", "순위 조작": "Fake rank", "이번 턴 표시 순위를 원하는 위치로 변경": "Move your displayed rank for this turn",
  "거래 정지": "Trading freeze", "선택 플레이어의 이번 턴 수동 거래 정지": "Stop a player's manual trading for this turn", "연봉 룰렛": "Salary roulette", "월급을 현재의 30~150%로 변경": "Change salary to 30–150% of its current value",
  "포트폴리오 셔플": "Portfolio shuffle", "모든 주식을 무작위 종목으로 교체하고 이번 턴 거래 잠금": "Randomize all holdings and lock trading for this turn",
  "공개할 종목": "Stock to reveal", "대상 플레이어": "Target player", "표시할 순위 (1~30)": "Displayed rank (1–30)", "추가 선택 없이 즉시 적용됩니다.": "Applies immediately without another selection.",
  "통신 차단": "SIGNAL BLOCKED", "최종": "FINAL", "실시간": "LIVE", "계속": "Resume",
  "아이템으로 모든 플레이어의 실시간 순위가 차단되었습니다.": "An item has blocked live rankings for every player.", "방장": "Host", "준비되면 시작하세요. 빈자리는 즉시 AI가 채웁니다.": "Start when ready. AI fills every empty seat.", "방장이 게임을 시작할 때까지 기다려주세요.": "Wait for the host to start the game.",
  "매수 완료": "Buy complete", "매도 완료": "Sell complete", "예약 주문을 등록했습니다.": "Limit order placed.", "예약 주문을 취소했습니다.": "Limit order cancelled.", "대출이 실행되었습니다.": "Loan issued.", "대출을 상환했습니다.": "Loan repaid.", "채권을 매수했습니다.": "Bond purchased.",
  "프로필 사진을 적용했습니다.": "Profile photo applied.", "방 코드를 복사했습니다.": "Room code copied.", "방 코드를 직접 복사해주세요.": "Please copy the room code manually.",
  "가장 많이 보유한 종목 · 클릭해서 차트 보기": "Largest holding · click to view chart", "상세 정보": "details", "과거": "Past", "시": "O", "고": "H", "저": "L", "종": "C",
  "최후의 트레이더가 되었습니다.": "You are the last trader standing.", "다음 게임에서는 정보 아이템과 예약 주문을 더 일찍 활용해보세요.": "Next game, use information items and limit orders earlier.",
  "아직 알림이 없습니다.": "No notifications yet.", "아직 완료된 게임이 없습니다.": "No completed games yet.", "익명": "Anonymous", "보유 종목 없음": "No holdings yet",
  "주요 거래 기록": "Key activity", "기록된 거래·금융 활동이 없습니다.": "No trades or finance activity recorded.",
  "받는 플레이어 검색": "Search recipient", "비공개 시장 정보": "Private market tip", "아직 주고받은 쪽지가 없습니다.": "No sent or received messages yet.",
  "첫 쪽지를 보내 대화를 시작하세요.": "Start a new conversation.", "대화를 선택하거나 새 쪽지를 보내세요.": "Select a conversation or send a new message.", "거래량 폭등": "VOLUME SURGE", "거래량 폭락": "VOLUME DROP",
  "글자": "Text", "글자 작게": "Smaller text", "글자 크게": "Larger text", "시장": "Market", "차트": "Chart", "거래": "Trade", "자산": "Assets", "순위": "Rank", "쪽지": "Messages", "전체 채팅": "Room chat", "모든 생존자와 대화": "Chat with every survivor", "전체 메시지 입력": "Message everyone", "전송": "Send", "일개미(개발자) 메일 :": "Developer ant email:",
  "매수": "Buy", "매도": "Sell", "아이템": "Item", "대출": "Loan", "채권": "Bonds", "게임 상태를 읽지 못했습니다.": "Could not read the game state.", "온라인 세션이 없습니다.": "No online session is active.",
  "PNG, JPG 또는 WebP 이미지를 선택하세요.": "Choose a PNG, JPG or WebP image.", "이미지를 읽을 수 없습니다.": "Could not read the image.", "작업을 완료하지 못했습니다.": "Could not complete the action.", "서버 요청을 처리하지 못했습니다.": "The server could not process the request.",
});

const PATTERNS = [
  [/^(\d+) \/ (\d+)명 참가$/, "$1 / $2 players"], [/^(\d+)명$/, "$1 players"], [/^(\d+)개 종목$/, "$1 stocks"], [/^(\d+)위$/, "#$1"], [/^(\d+)주$/, "$1 shares"],
  [/^(\d+)턴 시작$/, "Turn $1 started"], [/게임 시작 월급/g, "Starting salary"], [/월급/g, "salary"], [/지급/g, "paid"], [/세금/g, "tax"], [/자동 납부/g, "automatically deducted"],
  [/매수/g, "bought"], [/매도/g, "sold"], [/예약/g, "limit "], [/체결/g, "filled"], [/대출/g, "loan"], [/상환/g, "repaid"], [/채권/g, "bond"], [/만기/g, "matured"], [/입금/g, "credited"], [/사용/g, "used"], [/탈락했습니다/g, "was eliminated"],
  [/플레이어가 (\d+)턴에/g, "player on turn $1"], [/자산이 (\d+)턴 연속 상승 중입니다\./g, "Assets have risen for $1 consecutive turns."],
  [/^(\d+) \/ (\d+)명$/, "$1 / $2 players"], [/^(\d+)위 플레이어 정보$/, "#$1 player details"], [/^실제 순위 (\d+)위$/, "Actual rank #$1"], [/^현재 T(\d+)$/, "Current T$1"],
  [/^(\d+)개 종목으로 포트폴리오가 교체되었습니다\.$/, "Portfolio replaced with $1 stocks."], [/^새 월급은 (.+)입니다\.$/, "New salary: $1."], [/^상승 신호: /, "Rising signal: "], [/^하락 신호: /, "Falling signal: "],
  [/ 다음 가격: /g, " next price: "], [/을 사용했습니다\.$/g, " used."], [/ 평가액 /g, " · value "], [/ 현재가 /g, " · price "], [/주 ·/g, " shares ·"], [/주$/g, " shares"],
  [/^보유 종목 ·/, "Holdings ·"], [/^연속 (\d+)↑$/, "$1-turn streak ↑"], [/^T(\d+) 기준$/, "T$1 snapshot"], [/^ANONYMOUS ·/, "ANONYMOUS ·"],
];

export function getLanguage() { return language; }
export function translateText(value) {
  if (language === "ko") return value;
  const trimmed = String(value).trim();
  if (!trimmed) return value;
  let translated = EN[trimmed] || trimmed;
  if (!EN[trimmed]) for (const [pattern, replacement] of PATTERNS) translated = translated.replace(pattern, replacement);
  const leading = String(value).match(/^\s*/)?.[0] || "";
  const trailing = String(value).match(/\s*$/)?.[0] || "";
  return `${leading}${translated}${trailing}`;
}

export function setLanguage(next) {
  language = next === "en" ? "en" : "ko";
  document.documentElement.lang = language;
  localizeDocument(document.body);
}

export function localizeDocument(root = document.body) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (node.parentElement?.closest("script,style,[data-no-i18n]")) continue;
    if (!textOriginals.has(node)) textOriginals.set(node, node.nodeValue);
    const original = textOriginals.get(node);
    node.nodeValue = language === "en" ? translateText(original) : original;
  }
  root.querySelectorAll?.("[placeholder],[title],[aria-label]").forEach((element) => {
    if (!attributeOriginals.has(element)) attributeOriginals.set(element, {});
    const originals = attributeOriginals.get(element);
    for (const attr of ["placeholder", "title", "aria-label"]) {
      if (!element.hasAttribute(attr)) continue;
      originals[attr] ??= element.getAttribute(attr);
      element.setAttribute(attr, language === "en" ? translateText(originals[attr]) : originals[attr]);
    }
  });
}

export function phrase(key, values = {}) {
  const table = {
    leaderReclaimed: { ko: `${values.name} 플레이어가 1위를 탈환했습니다.`, en: `${values.name} has reclaimed first place.` },
    leaderChanged: { ko: `${values.name} 플레이어가 1위로 변경되었습니다.`, en: `${values.name} has moved into first place.` },
    matchingCount: { ko: `${values.count} / ${values.capacity}명 참가`, en: `${values.count} / ${values.capacity} players joined` },
    aiFill: { ko: "5초 뒤 빈자리는 AI 트레이더가 채웁니다.", en: "AI traders fill empty seats after 5 seconds." },
  };
  return table[key]?.[language] || key;
}
