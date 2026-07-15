// 목업 게임 데이터 생성기 — src/mocks/games.json 산출
// 결정론적(고정 시드)이라 재실행해도 같은 결과. 실행: node scripts/generate-mock-games.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../src/mocks/games.json");

// mulberry32 시드 RNG
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260714);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
// 대략적 정규분포 (Box-Muller)
const gauss = (mean, sd) => {
  const u = Math.max(rand(), 1e-9), v = Math.max(rand(), 1e-9);
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// 장르: Steam genre ID 원본 (1 액션, 2 전략, 3 RPG, 4 캐주얼, 9 레이싱, 18 스포츠,
// 23 인디, 25 어드벤처, 28 시뮬레이션, 29 MMO, 37 F2P, 70 얼리액세스)
const GENRE_POOL = [1, 2, 3, 4, 9, 18, 23, 25, 28, 29, 70];

// 실존 상위권 게임 (appid 실제값 → 헤더 이미지 실로드 가능. 수치는 목업)
// [appid, nameEn, nameKo(null=영문 동일), isFree, players, usdCents(null=무료), reviewScore, genreIds]
const REAL = [
  [730, "Counter-Strike 2", "카운터-스트라이크 2", true, 1418000, null, 8, [1, 37]],
  [570, "Dota 2", null, true, 692000, null, 8, [1, 2, 37]],
  [578080, "PUBG: BATTLEGROUNDS", null, true, 611000, null, 6, [1, 29, 37]],
  [2694490, "Path of Exile 2", "패스 오브 엑자일 2", false, 348000, 2999, 6, [1, 3, 70]],
  [1172470, "Apex Legends", "에이펙스 레전드", true, 301000, null, 6, [1, 37]],
  [2767030, "Marvel Rivals", "마블 라이벌즈", true, 287000, null, 7, [1, 37]],
  [271590, "Grand Theft Auto V", null, false, 224000, 2999, 8, [1, 25]],
  [3164500, "Schedule I", null, false, 187000, 1999, 9, [23, 28]],
  [2389730, "ARC Raiders", "아크 레이더스", false, 176000, 3999, 8, [1, 25]],
  [1623730, "Palworld", "팰월드", false, 158000, 2999, 8, [1, 25, 70]],
  [1938090, "Call of Duty", "콜 오브 듀티", false, 152000, 6999, 5, [1]],
  [2807960, "Battlefield 6", "배틀필드 6", false, 149000, 6999, 6, [1]],
  [252490, "Rust", "러스트", false, 141000, 3999, 8, [1, 25, 29]],
  [1203220, "NARAKA: BLADEPOINT", "나라카: 블레이드포인트", true, 138000, null, 7, [1, 25, 37]],
  [236390, "War Thunder", "워 썬더", true, 121000, null, 6, [1, 28, 29, 37]],
  [2507950, "Delta Force", "델타 포스", true, 118000, null, 6, [1, 37]],
  [1086940, "Baldur's Gate 3", "발더스 게이트 3", false, 104000, 5999, 9, [3, 25]],
  [440, "Team Fortress 2", "팀 포트리스 2", true, 98000, null, 9, [1, 37]],
  [359550, "Tom Clancy's Rainbow Six Siege X", "레인보우 식스 시즈 X", true, 94000, null, 7, [1, 37]],
  [2246340, "Monster Hunter Wilds", "몬스터 헌터 와일즈", false, 88000, 6999, 5, [1, 3]],
  [553850, "HELLDIVERS 2", "헬다이버즈 2", false, 86000, 3999, 8, [1]],
  [413150, "Stardew Valley", "스타듀 밸리", false, 84000, 1499, 9, [3, 23, 28]],
  [230410, "Warframe", "워프레임", true, 81000, null, 8, [1, 3, 37]],
  [431960, "Wallpaper Engine", "월페이퍼 엔진", false, 79000, 399, 9, [4, 23]],
  [1091500, "Cyberpunk 2077", "사이버펑크 2077", false, 72000, 5999, 8, [3, 25]],
  [1085660, "Destiny 2", "데스티니 가디언즈", true, 68000, null, 6, [1, 3, 37]],
  [3241660, "R.E.P.O.", null, false, 66000, 999, 9, [1, 23, 25]],
  [381210, "Dead by Daylight", "데드 바이 데이라이트", false, 63000, 1999, 6, [1, 25]],
  [105600, "Terraria", "테라리아", false, 61000, 999, 9, [1, 23, 25]],
  [1245620, "ELDEN RING", "엘든 링", false, 59000, 5999, 8, [1, 3]],
  [1030300, "Hollow Knight: Silksong", "할로우 나이트: 실크송", false, 57000, 1999, 9, [1, 23, 25]],
  [1172710, "Dune: Awakening", "듄: 어웨이크닝", false, 54000, 4999, 7, [1, 29, 28]],
  [4000, "Garry's Mod", "개리스 모드", false, 52000, 999, 9, [23, 28]],
  [221100, "DayZ", "데이즈", false, 49000, 4999, 7, [1, 25, 29]],
  [394360, "Hearts of Iron IV", "하츠 오브 아이언 IV", false, 47000, 4999, 8, [2, 28]],
  [1599340, "Lost Ark", "로스트아크", true, 46000, null, 6, [1, 3, 29, 37]],
  [227300, "Euro Truck Simulator 2", "유로 트럭 시뮬레이터 2", false, 44000, 1999, 9, [28]],
  [238960, "Path of Exile", "패스 오브 엑자일", true, 42000, null, 8, [1, 3, 37]],
  [3527290, "PEAK", null, false, 41000, 799, 9, [4, 23, 25]],
  [2379780, "Balatro", "발라트로", false, 39000, 1499, 9, [4, 23]],
  [251570, "7 Days to Die", "7 데이즈 투 다이", false, 38000, 4499, 8, [1, 25, 28]],
  [289070, "Sid Meier's Civilization VI", "문명 VI", false, 37000, 2999, 8, [2]],
  [1771300, "Kingdom Come: Deliverance II", "킹덤 컴: 딜리버런스 II", false, 36000, 5999, 9, [1, 3]],
  [108600, "Project Zomboid", "프로젝트 좀보이드", false, 35000, 1999, 9, [23, 28, 70]],
  [2399830, "ARK: Survival Ascended", "아크: 서바이벌 어센디드", false, 34000, 4499, 6, [1, 25, 29]],
  [346110, "ARK: Survival Evolved", "아크: 서바이벌 이볼브드", false, 33000, 1999, 7, [1, 25, 29]],
  [892970, "Valheim", "발헤임", false, 32000, 1999, 9, [1, 25, 70]],
  [1142710, "Total War: WARHAMMER III", "토탈 워: 워해머 III", false, 31000, 5999, 7, [2]],
  [39210, "FINAL FANTASY XIV Online", "파이널 판타지 14", false, 30000, 1999, 7, [3, 29]],
  [1158310, "Crusader Kings III", "크루세이더 킹즈 III", false, 29000, 4999, 8, [2, 3, 28]],
  [281990, "Stellaris", "스텔라리스", false, 28000, 4999, 8, [2, 28]],
  [1222670, "The Sims 4", "심즈 4", true, 27500, null, 6, [4, 28, 37]],
  [2073850, "THE FINALS", "더 파이널스", true, 27000, null, 7, [1, 37]],
  [294100, "RimWorld", "림월드", false, 26500, 3499, 9, [2, 23, 28]],
  [1145350, "Hades II", "하데스 II", false, 26000, 2999, 9, [1, 3, 23]],
  [526870, "Satisfactory", "새티스팩토리", false, 25500, 3999, 9, [23, 28]],
  [427520, "Factorio", "팩토리오", false, 25000, 3500, 9, [2, 23, 28]],
  [550, "Left 4 Dead 2", "레프트 4 데드 2", false, 24500, 999, 9, [1]],
  [1172620, "Sea of Thieves", "씨 오브 시브즈", false, 24000, 3999, 7, [1, 25]],
  [2357570, "Overwatch 2", "오버워치 2", true, 23500, null, 3, [1, 37]],
  [2139460, "Once Human", "원스 휴먼", true, 23000, null, 6, [1, 25, 29, 37]],
  [548430, "Deep Rock Galactic", "딥 락 갤럭틱", false, 22000, 2999, 9, [1, 23]],
  [552990, "World of Warships", "월드 오브 워쉽", true, 21000, null, 6, [1, 28, 37]],
  [1295660, "Sid Meier's Civilization VII", "문명 VII", false, 20000, 6999, 5, [2]],
  [949230, "Cities: Skylines II", "시티즈: 스카이라인 II", false, 19000, 4999, 5, [28, 2]],
  [582010, "Monster Hunter: World", "몬스터 헌터: 월드", false, 18500, 2999, 8, [1, 3]],
  [1966720, "Lethal Company", "리썰 컴퍼니", false, 18000, 999, 9, [1, 23, 70]],
  [2001120, "Split Fiction", "스플릿 픽션", false, 17500, 4999, 9, [1, 25]],
  [292030, "The Witcher 3: Wild Hunt", "더 위쳐 3: 와일드 헌트", false, 17000, 3999, 9, [3, 25]],
  [1794680, "Vampire Survivors", "뱀파이어 서바이버즈", false, 16000, 499, 9, [1, 4, 23]],
  [945360, "Among Us", "어몽 어스", false, 15000, 499, 8, [4, 23]],
  [761890, "Albion Online", "알비온 온라인", true, 14500, null, 7, [3, 29, 37]],
  [814380, "Sekiro: Shadows Die Twice", "세키로: 섀도우 다이 트와이스", false, 14000, 5999, 9, [1, 25]],
  [374320, "DARK SOULS III", "다크 소울 III", false, 13500, 5999, 9, [1, 3]],
  [646570, "Slay the Spire", "슬레이 더 스파이어", false, 13000, 2499, 9, [2, 4, 23]],
  [367520, "Hollow Knight", "할로우 나이트", false, 12500, 1499, 9, [1, 23, 25]],
  [270880, "American Truck Simulator", "아메리칸 트럭 시뮬레이터", false, 12000, 1999, 9, [28]],
  [236850, "Europa Universalis IV", "유로파 유니버셜리스 IV", false, 11500, 3999, 8, [2]],
  [1085220, "Figment 2: Creed Valley", null, false, 11000, 1999, 8, [1, 25, 23]],
];

// 합성 게임명 재료 (롱테일)
const ADJ = ["Neon", "Iron", "Void", "Crimson", "Frozen", "Ancient", "Cosmic", "Rusty", "Silent", "Savage", "Lunar", "Shattered", "Endless", "Grim", "Radiant", "Feral", "Hollow", "Astral", "Molten", "Phantom"];
const NOUN = ["Frontier", "Dungeon", "Tactics", "Survivors", "Legends", "Factory", "Odyssey", "Kingdom", "Arena", "Depths", "Horizon", "Bastion", "Caravan", "Expanse", "Garden", "Foundry", "Voyage", "Citadel", "Outpost", "Rift"];
const SUFFIX = ["", "", "", " II", " Online", " Deluxe", " Chronicles", " Reborn", " Zero", " Tycoon"];

const USD_TIERS = [499, 799, 999, 1499, 1999, 2499, 2999, 3999, 4999];
const DISCOUNTS = [10, 15, 20, 25, 30, 33, 40, 50, 60, 66, 70, 75, 80];
// 리뷰 점수 분포 (롱테일)
const SCORE_POOL = [9, 9, 9, 8, 8, 8, 8, 7, 7, 6, 6, 5, 5, 4, 3, 2];

// USD 센트 → KRW (Steam 규약 최소단위×100). 환율 ~₩1,080/센트 근사 후 100원 반올림
const toKrwMinor = (usdCents) => Math.round((usdCents * 10.8) / 100) * 100 * 100;

function makePrices(usdCents, onSale) {
  if (usdCents == null) return { priceKrw: null, priceUsd: null };
  const discountPct = onSale ? pick(DISCOUNTS) : 0;
  const krwInitial = toKrwMinor(usdCents);
  // usdCents는 이미 최소 화폐 단위(센트) — Steam price_overview 규약 그대로
  const usdInitial = usdCents;
  const applyDc = (v) => Math.round((v * (100 - discountPct)) / 100);
  return {
    priceKrw: { initial: krwInitial, final: applyDc(krwInitial), discountPct },
    priceUsd: { initial: usdInitial, final: applyDc(usdInitial), discountPct },
  };
}

const games = [];
const usedNames = new Set();

// 1) 실존 게임 → rank 1~N (players 내림차순 정렬)
const real = [...REAL].sort((a, b) => b[4] - a[4]);
for (const [appid, nameEn, nameKo, isFree, players, usdCents, score, genreIds] of real) {
  const onSale = !isFree && rand() < 0.25;
  games.push({
    appid, nameEn, nameKo: nameKo ?? nameEn, isFree, players,
    hasImage: true, reviewScore: score,
    totalReviews: Math.round(players * (8 + rand() * 40)),
    genreIds: isFree ? [...new Set([...genreIds, 37])] : genreIds,
    ...makePrices(usdCents, onSale),
  });
  usedNames.add(nameEn);
}

// 2) 합성 롱테일 → rank N+1 ~ 1000 (Zipf 유사 감쇠)
const anchorRank = games.length;
const anchorPlayers = games[games.length - 1].players;
const A = anchorPlayers * Math.pow(anchorRank, 0.92);
let prevPlayers = anchorPlayers;
for (let r = anchorRank + 1; r <= 1000; r++) {
  let name;
  do {
    name = `${pick(ADJ)} ${pick(NOUN)}${pick(SUFFIX)}`;
  } while (usedNames.has(name));
  usedNames.add(name);

  const base = A / Math.pow(r, 0.92);
  const players = Math.max(180, Math.min(prevPlayers - 1, Math.round(base * (0.94 + rand() * 0.12))));
  prevPlayers = players;

  const isFree = rand() < 0.22;
  const usdCents = isFree ? null : pick(USD_TIERS);
  const onSale = !isFree && rand() < 0.22;
  const genreCount = 1 + Math.floor(rand() * 3);
  const genreIds = [...new Set(Array.from({ length: genreCount }, () => pick(GENRE_POOL)))];
  games.push({
    appid: 90_000_000 + r, // 실존 appid와 충돌하지 않는 가짜 대역
    nameEn: name, nameKo: name, isFree, players,
    hasImage: false,
    reviewScore: pick(SCORE_POOL),
    totalReviews: Math.round(players * (3 + rand() * 30)),
    genreIds: isFree ? [...new Set([...genreIds, 37])] : genreIds,
    ...makePrices(usdCents, onSale),
  });
}

// 3) rank + 변화율 + 피크 부여
games.sort((a, b) => b.players - a.players);
games.forEach((g, i) => {
  g.rank = i + 1;
  g.change24h = Number(clamp(gauss(0, 6), -60, 60).toFixed(1));
  g.change7d = Number(clamp(gauss(0, 12), -60, 90).toFixed(1));
  g.change30d = Number(clamp(gauss(0, 25), -75, 150).toFixed(1));
  g.peak24h = Math.round(g.players * (1.02 + Math.abs(gauss(0, 0.12))));
});

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(games), "utf8");
console.log(`OK: ${games.length} games -> ${OUT}`);
