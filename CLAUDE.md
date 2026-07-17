# 스팀 동접 버블맵 (가칭) — 개발 스펙 v3

> 이 문서는 Claude Code가 이 프로젝트를 개발할 때 참조하는 단일 기준 문서다.
> 여기 적힌 결정사항과 제약은 리서치·논의를 통해 확정된 것이므로 임의로 변경하지 않는다.
> 변경이 필요하면 먼저 사용자에게 확인한다.

> **v3 변경사항 (킥오프 리뷰 반영)**: ① 목표를 "트래픽 검증 → 수익화 점화 → 검증된 축으로만 확장" 직렬 구조로 확정 ② Launch 슬라이스 / 후행 분리 — ja/zh 오픈·Tier 3·세일 감지 트리거는 트래픽 신호 후로 이동 ③ Tier 3 갱신 주기 하향 ④ 모니터링(데드맨스위치) 요건 추가 ⑤ store API 장애 시 우아한 강등 설계
> (v2: 확장형 인프라 / DB+스케줄러 / 다국어 구조 / 심층 랭킹 / 장르 / KRW·USD)

---

## 0. 목표와 순서 (직렬 — 병렬 아님)

**트래픽 검증 → 수익화 점화 → 검증된 축으로만 확장.**

- 수익화 3종(광고·어필리에이트·스폰서십)은 전부 트래픽의 함수다. 트래픽 가설 검증 전의 수익화 작업은 금지 (8번 백로그가 강제).
- 확장(추가 로케일, 심층 티어, 갱신 고빈도)은 트래픽이 증명된 뒤 그것을 곱하는 레버다. **0에 곱셈부터 만들지 않는다.**
- 단, **되돌리기 비싼 구조 결정**(i18n 라우팅, `(appid, cc)` 스키마, 티어링 개념)은 선반영한다. 확장의 "구조"는 지금, "오픈"은 신호 후.
- 이 프로젝트의 해자는 세 가지뿐이며 모든 기능 투자는 이 셋 중 하나에 기여해야 한다: **① 한국어 SEO 선점 속도 ② 축적된 히스토리 ③ 버블맵이라는 공유 가능한 포맷.** 어디에도 기여하지 않는 기능은 만들지 않는다.

## 1. 프로젝트 정체성 (절대 원칙)

**"다국어 스팀 데이터 도구. 유저를 모으지 않는다, 데이터를 쌓는다."**

- 이 프로젝트는 **도구(tool)**다. 커뮤니티가 아니다. 댓글, 게시판, 회원가입, 로그인, 유저 프로필 등 커뮤니티성 기능은 어떤 이유로도 만들지 않는다.
- 운영 목표: **방치형**. 배포 후 사람 손 없이 수집·갱신·배포가 자동으로 돌아야 한다.
- 비용 목표: **무료 티어로 시작, 트래픽에 비례해서만 지출.** 고정비를 만드는 선택(전용 서버 등)은 금지. 모든 인프라는 free tier → 유료 플랜 승급 경로가 있는 서비스만 사용.
- 타깃: 한국어 우선 + 일본어/중국어/영어(및 유럽어) 글로벌 롱테일. 경쟁 강도는 en(SteamDB·steamcharts 장악) > ja/zh(현지화 갭 존재) > ko(갭 최대) 순이므로, **SEO 투자 우선순위는 ko > ja/zh > en.**
- 포지셔닝: "동접(인기 신호) × 할인(구매 신호)"을 결합한 발견 도구.

## 2. 기술 스택

| 영역 | 선택 | 비고 |
|---|---|---|
| 프레임워크 | Next.js 15 (App Router) + TypeScript | |
| 스타일 | Tailwind CSS | |
| 시각화 | d3-force(물리) + **PixiJS(Canvas/WebGL 렌더링)** | UI 레퍼런스 cryptobubbles.net 채택에 따라 SVG → Canvas 전환. 수백 개 버블 상시 애니메이션은 SVG로 60fps 불가 |
| DB | Postgres — **Neon** (serverless, scale-to-zero) | 무료 티어 시작. Drizzle ORM 사용 |
| 수집 트리거 | Next.js Route Handler(`/api/cron/*`) + **Upstash QStash 스케줄** | 아래 4-1 참조. GitHub Actions 사용 금지 |
| 캡처 | `@zumer/snapdom` | **html2canvas 금지** (제작자 프로덕션 비권장, D3 SVG 깨짐. snapdom은 SVG foreignObject 방식, 30~100배 빠름) |
| OG 이미지 | `next/og` ImageResponse | |
| i18n | next-intl (locale 라우팅 + 사전) | |
| 배포 | Vercel (Hobby → 트래픽 시 Pro) | |
| 애널리틱스 | Vercel Analytics | 지면 소개서용 지표 축적 |

### 비용 사다리 (확장 경로)
| 단계 | 구성 | 월 비용 |
|---|---|---|
| 시작 | Vercel Hobby + Neon Free + QStash Free | $0 |
| 성장 | Vercel Pro + Neon Launch | ~$25~40 |
| 확장 | + 수집 워커 분리(Cloudflare Workers/Fly.io), CDN 캐시 튜닝 | 트래픽 비례 |

## 3. 데이터 소스 (전부 공식/공개 API)

**API 예산 원칙 — 두 도메인은 한도 체계가 완전히 다르다:**
| 도메인 | 한도 | 성격 |
|---|---|---|
| `api.steampowered.com` (동접 계열) | **일 100,000콜 (공식, API 키 기준)** | 예산이 넉넉함. 아래 스케줄은 예산의 ~67% 사용, 헤드룸 33% |
| `store.steampowered.com` (appdetails/appreviews) | **비공식 ~200콜/5분/IP** | 진짜 병목. 지속 실행은 반드시 이 상한 아래로 |

- **Steam Web API 키를 발급받아 사용한다** (무료, https://steamcommunity.com/dev/apikey). 일 10만 콜 예산의 전제 조건.
- 두 도메인 모두 **429/5xx 시 지수 백오프 + 연속 실패 시 서킷브레이커(해당 잡 일시 중단 + 알림)** 를 공통 fetch 유틸에 내장. 스케줄에는 지터를 넣고 정시(:00) 실행을 피한다.

### 3-1. 동접자 Top 100 (공식 차트)
```
GET https://api.steampowered.com/ISteamChartsService/GetGamesByConcurrentPlayers/v1/
```
- **실테스트 기록 (2026-07)**: `GetMostPlayedGames`는 `{ rank, appid, last_week_rank, peak_in_game }`만 반환하고 **현재 동접(concurrent_in_game)은 없다**(주간 피크만). 반면 **`GetGamesByConcurrentPlayers`는 `{ rank, appid, concurrent_in_game, peak_in_game }`를 반환** — 호출 1번으로 top 100의 현재 동접+피크를 현재 동접 기준 랭킹으로 모두 얻는다. 따라서 Tier 1은 이 엔드포인트 1콜로 처리(기존 GetMostPlayedGames + 앱별 100콜 조합을 대체).
- **갱신: 10분마다** (일 144콜 — 사실상 무료). 메인 버블맵을 준실시간으로 만드는 핵심. 참고: SteamDB는 상위 1,000개를 5분, 나머지를 10분 주기로 갱신함 — 이 빈도대는 실증된 안전 영역.

### 3-2. 심층 랭킹 (101위 이하)
- **실테스트 기록 (2026-07)**: `GetGamesByConcurrentPlayers`는 **정확히 100개만 반환**(rank 1~100). 100개 초과 반환은 없으므로 폴링 예산 절약 효과 없음 → 아래 **보장된 폴백(앱별 폴링)이 Tier 2의 유일한 경로**다.
- **보장된 폴백**: 앱별 개별 폴링
```
GET https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid={appid}
```
- 폴링 유니버스(추적 대상 앱 목록) 구성: 공식 top 100 히스토리 누적 ∪ SteamSpy top 페이지(`steamspy.com/api.php?request=all&page=N`, 1req/sec 제한) ∪ 스팀 인기 판매 차트. DB의 `apps` 테이블에 유니버스를 유지하고 신규 진입 앱은 자동 편입.
- 갱신 티어링 (일 10만 콜 예산 기반):
  - Tier 1 (rank 1~100): 3-1 호출에 포함됨 (10분 해상도) — **Launch**
  - Tier 2 (rank 101~1,000): **30분마다** (900앱 × 48회 = 43,200콜/일) — **Launch**
  - Tier 3 (rank 1,001~3,000): **3시간마다 (일 8회)** — **2026-07 사용자 결정으로 오픈** (버블맵 딥 랭크 표시용. 기존 "일 1~2회 후행" 스펙을 맵 신선도 요건에 맞춰 상향 — 스냅샷 recency 4h 창 안에 들어와야 맵에 뜬다). 2,000앱 × 8회 = 16,000콜/일. 유니버스 = SteamSpy top 3페이지(소유자 순 3,000) CCU 정렬, 상위 900=Tier 2 · 다음 2,000=Tier 3, 탈락분은 tier 4(휴면) 강등. **트리거는 전용 스케줄이 아니라 players-tier2 마지막 배치의 셀프 킥오프**(job_runs 신선도 검사, 3h 경과 시 발행) — QStash 스케줄 추가 없이 자율 구동, 전용 스케줄을 만들어도 중복 발화 없음
  - 합계 ~63,000콜/일, 예산의 2/3 이하. 429 시 Tier 3부터 주기를 늘리는 자동 감속 로직 포함
  - 티어는 최근 피크 동접 기준으로 일 1회 재배정

### 3-3. 가격 + 메타데이터 + 로컬라이즈 (통화·언어 겸용 호출)
```
GET https://store.steampowered.com/api/appdetails?appids={appid}&cc=kr&l=korean&filters=price_overview,basic,genres
GET https://store.steampowered.com/api/appdetails?appids={appid}&cc=us&l=english&filters=price_overview,basic,genres
```
- **호출 1번이 통화 + 언어를 동시에 해결한다**: cc=kr 호출 → KRW 가격·할인율 + 한국어 게임명·장르, cc=us 호출 → USD + 영어명. 통화 추가(JPY, EUR 등)는 cc 루프에 원소 추가로 확장 — 스키마는 처음부터 `(appid, cc)` 복합 키로 설계.
- **스로틀 규칙 (중요 — 기존 600ms 스펙 폐기)**: 600ms 간격은 5분에 500콜로 비공식 상한(~200콜/5분)을 초과해 지속 실행 시 429 위험. **지속 실행은 1.6초 간격(≈187콜/5분)으로 상한 바로 아래 유지.** 이 예산으로 3,000앱 × 2통화 = 6,000콜을 약 2.5시간 창에서 소화 가능.
- 갱신 주기: **Tier 1 일 1회, Tier 2 격일, Tier 3 주 1회.** 세일 이벤트 트리거(Tier 1에서 할인 비율 급증 감지 시 전체 강제 갱신)는 **후행** — 트래픽 신호 후 추가.
- **우아한 강등**: store 도메인은 비공식 API라 정책 변경·장애 리스크를 수용한다. 단 장애 시 사이트가 깨지면 안 됨 — 가격/평점 데이터가 stale(갱신 실패 누적)이면 해당 UI를 "가격 정보 일시 미제공"으로 숨기고 동접 기능은 정상 유지되도록 설계.
- 일부 앱은 details null 반환 → try/catch 스킵. 무료 게임은 price_overview 없음 → `is_free` 플래그.

### 3-4. 평점
```
GET https://store.steampowered.com/appreviews/{appid}?json=1&num_per_page=0&language=all&purchase_type=all
```
- `num_per_page=0`으로 query_summary만 수신 (review_score 1~9, total_positive/negative/reviews).
- **review_score_desc 문자열은 저장하지 않는다.** review_score 숫자만 저장하고, 표시 라벨("압도적으로 긍정적" 등)은 자체 i18n 사전에서 로케일별 매핑.

## 4. 아키텍처

### 4-1. 수집 파이프라인 (GitHub Actions 대체)
- 수집 로직은 전부 Next.js Route Handler로 구현: `/api/cron/players-tier1`, `/api/cron/players-tier2`, `/api/cron/details`, `/api/cron/retier` 등.
- 각 핸들러는 `Authorization: Bearer ${CRON_SECRET}` 검증 필수.
- 트리거는 **Upstash QStash 스케줄**이 해당 엔드포인트를 호출 (무료 티어로 시작, 재시도·실패 알림 내장). Vercel Pro 전환 시 Vercel Cron으로 이관 가능하도록 핸들러는 트리거에 비종속적으로 작성.
- 장시간 작업(appdetails 순회)은 Vercel 함수 타임아웃(무료 10s/Pro 60s+)을 넘지 않게 **배치 분할 + QStash 체이닝**(핸들러가 다음 배치를 QStash로 자가 큐잉)으로 처리.
- **모니터링 (방치형의 전제조건)**: ① 각 수집 잡 완료 시 `job_runs(job, ts, status, rows)` 기록 ② **데드맨스위치** — 일 1회 헬스체크 크론이 "Tier 1 스냅샷이 최근 1시간 내 없음 / 가격 갱신이 3일 내 없음" 등을 검사해 위반 시 **Discord 웹훅으로 알림** ③ 서킷브레이커 발동 시에도 동일 웹훅. 알림 채널은 개인 Discord 서버 (환경변수 `ALERT_WEBHOOK_URL`).
- 히스토리는 git이 아니라 DB에 축적: `player_snapshots(appid, ts, players)`. 상향된 수집 빈도 기준 일 ~5만 행 적재되므로 **보존 정책 필수**: 원본 스냅샷 30~90일 보존 → 시간 단위 롤업(`player_hourly`) 1년 → 일 단위 롤업(`player_daily`) 영구. 롤업·정리 잡은 일 1회 크론.

### 4-2. DB 스키마 (Drizzle, 초안)
```
apps(appid PK, name_en, name_ko, header_image, is_free, tier, last_seen_rank, ...)
genres(id PK)                      -- Steam genre ID 원본
app_genres(appid, genre_id)
genre_i18n(genre_id, locale, label) -- 자체 관리 사전 (장르 ID는 ~20개 소규모 고정)
prices(appid, cc, currency, price, discount_percent, updated_at)  -- PK(appid, cc)
reviews(appid, review_score, total_positive, total_negative, total_reviews, updated_at)
player_snapshots(appid, ts, players)
player_daily(appid, date, peak, avg)  -- 롤업
```

### 4-3. 서빙
- 페이지는 DB를 조회하는 서버 컴포넌트 + ISR(`revalidate: 1800~3600`).
- 랭킹/장르 목록 쿼리는 인덱스 설계 필수: `player_snapshots(ts)`, `apps(tier, last_seen_rank)`.

### 4-4. i18n — 구조는 지금, 오픈은 신호 후
- 로케일 라우팅 구조: next-intl로 `/ko`, `/en`, `/ja`, `/zh`, 유럽어까지 사전 파일 추가만으로 열리게 설계. **오픈: `/ko`(기본) + `/en`** (2026-07 사용자 결정으로 en 정식 오픈 — 색인·sitemap·hreflang·언어 전환 포함, 8번 en 동결 해제). ja/zh는 여전히 후행.
- **ja/zh 오픈은 후행**: 일본어 게임명 없는 일본어 페이지는 SEO 허수다(일본 유저는 일본어 제목으로 검색). ja 오픈은 JPY 통화 확장(cc=jp 호출 → 일본어 제목 자동 확보)과 반드시 묶어서 진행. zh는 본토 구글 차단으로 실수요가 대만·홍콩권임을 감안해 우선순위 최하.
- UI 문자열: 소스는 `ko.json`, 나머지 로케일은 **빌드 전 자동 번역으로 생성해 커밋** (런타임 번역 API 호출 금지).
- SEO: 오픈된 로케일에만 hreflang·sitemap 적용. 다국어 상세 페이지는 SEO 승수지만, **곱셈은 ko 트래픽이 증명된 뒤에.**
- 통화 표시: 로케일 기본값(ko→KRW, 그 외→USD) + 헤더에서 수동 전환(쿠키 저장).

## 5. 화면 기능

### 5-1. 버블맵 (메인) — UI 레퍼런스: https://cryptobubbles.net

**cryptobubbles의 시각 문법을 채택한다. 좌표축 없음.** (기존 X=가격/Y=평점 산점도 방식 폐기)

레이아웃·인터랙션:
- 풀스크린 다크 배경 위 자유 부유 버블. d3-force 시뮬레이션(약한 center + collide + 랜덤 미세 요동으로 상시 유동감) + PixiJS 스프라이트 렌더링.
- **버블 크기** = 동접자 수 (sqrt 스케일, 선형 금지). **면적 예산(2026-07)**: Σπr²이 뷰포트×0.55를 넘으면 전체 반경을 균등 축소(비율 보존 — sqrt 인코딩 유지). 노드 수와 무관하게 팩킹이 한 화면에 담기게 하는 보정.
- **버블 색상** = 동접 변화율. 초록(증가) ↔ 빨강(감소), 변화폭에 비례한 채도.
  - 기간 탭: `24h | 7d | 30d` (player_snapshots/player_daily 기반).
  - **콜드스타트 폴백**: 히스토리 미축적 시점엔 공식 API의 24h 피크 대비 현재치(`players/peak24h`)로 색상 산출, 데이터가 쌓이면 실변화율로 자동 전환.
- **버블 내용물**: 게임 아트 원형 크롭 + 축약 게임명 + 변화율 %. 작은 버블은 아트만. **LOD는 화면상 반경(월드 r × 줌) 기준(2026-07, semantic zoom)** — 줌인하면 작은 버블에도 이름이 나타난다. 텍스트는 1/zoom 카운터 스케일로 화면 픽셀 크기 래스터(줌 블러 방지), 재래스터는 줌 12% 스텝 양자화.
- **할인 링 (차별점)**: 할인 중 게임은 버블에 노란 테두리 + 호버 시 할인율 뱃지. cryptobubbles에 없는 구매 신호 레이어.
- **클릭 → 상세 모달**: 미니 동접 추이 차트, 가격(선택 통화)·할인·평점, 그리고 `/[locale]/game/[id]` 상세 페이지 딥링크 버튼. (cryptobubbles는 모달에서 끝나지만 우리는 모달을 SEO 페이지 유입구로 사용)
- 상단 바: 기간 탭 / **범위 셀렉터**(드롭다운 — Top 100 · 101~300 · 301~500 · 501~750 · 751~1,000 · 1,001~1,250 … 2,751~3,000, 구간당 ≤250노드. Tier 3 오픈(2026-07)으로 13구간이 되며 칩 → 셀렉트 전환. 딥 밴드(1,001~) 선택 시 deep 스냅샷(3,000) lazy 로드 — SSR 초기 페이로드는 top 1,000 유지) / **장르 필터 칩(다중 선택)** / 검색(게임명 자동완성) / 설정 / 즐겨찾기(★).
- 설정 패널: 크기 기준(동접 | 24h 피크), 색상 기준(변화율 | 평점), 버블 내용물 토글. localStorage 저장.
- 즐겨찾기: ★ 토글한 게임만 보기 필터. localStorage 저장.
- 모바일 (2026-07 UX 결정 — 기존 "상단 바 접힘" 폐기): 필터 바 상시 노출(행 전체 가로 스크롤). 터치 = 탭(모달) + 한 손가락 팬 + 핀치 줌 전용 — 버블 드래그·hover 툴팁은 마우스/펜 전용 (밀집 뷰에서 모든 터치가 버블 위라 드래그가 팬/줌을 막던 문제). 맵 우하단 뷰 리셋 버튼.
- **버블 뽑기 (2026-07, 재방문 콘텐츠 — 해자 ③ 공유 포맷 기여)**: 맵 좌하단 FAB → 순위 범위(프리셋 칩 + 커스텀 min/max)를 정해 무작위 1게임 추첨하는 오버레이. 연출 = **CS:GO 케이스 오프닝 스타일 수평 룰렛**(버블 벨트 감속 → 니어미스 안착 → 당첨 확대). 사용자가 버튼으로 요청한 일회성 연출 + 버블맵 본체가 이미 상시 애니메이션이므로 **prefers-reduced-motion과 무관하게 항상 재생** (2026-07 — OS "애니메이션 효과 끔" 사용자에게 연출이 통째로 생략되던 문제 수정). **희귀도 티어 링**: 뽑은 범위 내 상대 순위 백분위로 금(≤5%)·레드(≤15%)·핑크(≤30%)·퍼플(≤50%)·블루 링 + "상위 n%" 라벨(CS:GO 레어리티 문법). 후보는 스냅샷 전체(화면 필터와 독립), 당첨작 상세는 기존 GameModal 재사용. 전부 클라이언트 전용 — 수집·DB·크론 무관.

### 5-2. 랭킹 테이블
- 버블맵 아래 or 별도 탭. 심층 랭킹(Tier 2~3 포함) 전체를 테이블로: 순위, 게임명, 동접, 24h 피크, 가격(선택 통화), 할인, 평점. 장르 필터·정렬 공유.

### 5-3. 게임 상세 `/[locale]/game/[id]`
- 동접 현황 + 추이 차트(player_daily), 평점 요약, 가격/할인 상태를 로케일별 자연문으로 자동 생성 (애드센스 승인용 텍스트 + "게임명+동접/할인" 검색 쿼리 타깃).
- generateStaticParams로 Tier 1~2 사전 생성, 나머지 on-demand ISR.

### 5-4. 캡처 + OG
- `@zumer/snapdom` PNG 다운로드 버튼, 우측 하단 사이트 URL 워터마크, 광고 영역 `data-capture="exclude"`.
- `/[locale]/og` ImageResponse: top 10 + 동접자 1200x630 동적 생성, 로케일별 메타태그.

## 6. 개발 단계

**Launch 슬라이스 = ko 로케일 + Tier 1·2 (Top ~1,000) + 버블맵 + 상세 페이지 + 캡처/OG.** 해자 3종(ko SEO, 히스토리, 공유 포맷)이 전부 여기 있다. 아래 Phase 1~5가 Launch이며, 각 Phase 완료 시마다 프로덕션 배포한다.

- **Phase 1 — 기반**: Next.js + next-intl 구조(오픈은 ko만) + Neon/Drizzle 스키마 + QStash 크론 파이프라인(Tier 1 수집 + job_runs + 데드맨스위치). 완료 기준: top 100 스냅샷 10분 주기 자동 적재 + 수집 중단 시 Discord 알림 수신 확인.
- **Phase 2 — 버블맵 + 랭킹 테이블**: 5-1(cryptobubbles 문법), 5-2. 완료 기준: 버블맵(색상 폴백 모드)·상세 모달·범위/장르/기간 필터·검색·즐겨찾기·통화 전환 동작, 300 노드 상시 애니메이션 데스크톱 60fps / 중급 모바일 30fps 이상. **→ 이 시점에 바이럴 테스트 1회 (캡처 이미지 커뮤니티 게시)**
- **Phase 3 — Tier 2 수집**: 유니버스 구축 + Tier 2 폴링 + 재배정 잡 + 롤업/보존 잡. `GetGamesByConcurrentPlayers` 실테스트 결과를 이 문서에 기록할 것.
- **Phase 4 — 상세 페이지 + SEO**: 5-3, ko hreflang·sitemap, 애드센스 신청 준비.
- **Phase 5 — 마감**: 캡처/OG 고도화, Vercel Analytics, 우아한 강등 동작 검증.

**후행 (트래픽 신호 후 — 8번 백로그 트리거 준수):** Tier 3 오픈, ja 오픈(+JPY), zh 오픈, en SEO 투자, 세일 감지 트리거, 유럽어.

## 7. 하지 말 것 (금지 목록)

- ❌ GitHub Actions (수집·크론 용도 일체)
- ❌ html2canvas
- ❌ 런타임 번역 API 호출 (번역은 빌드 타임 사전 생성만)
- ❌ 로케일/통화를 localStorage에 저장 (SSR이 읽어야 하므로 **쿠키** 필수. 즐겨찾기·버블 설정 등 클라이언트 전용 상태는 localStorage 사용이 표준이며 허용)
- ❌ 회원, 댓글, 게시판, 알림 등 커뮤니티 기능 일체
- ❌ IsThereAnyDeal / CheapShark API — ITAD 약관상 어필리에이트 태그 제거 금지 + 경쟁 앱 금지. 가격 데이터는 스팀 공식 API만
- ❌ 그레이마켓 키샵(G2A, Kinguin 등) 링크
- ❌ 고정비형 인프라 (전용 서버, 최소 과금 플랜 선결제)
- ❌ 동결 백로그(8번) 항목의 트리거 없는 선구현

## 8. 동결 백로그 (트리거 없이 착공 금지)

Claude Code는 사용자가 트리거 충족을 명시하기 전까지 아래 항목을 구현하지 않으며, 제안도 하지 않는다.

| 항목 | 내용 | 해제 트리거 |
|---|---|---|
| ~~Tier 3 오픈 (1,001~3,000위)~~ | 2026-07 사용자 결정으로 오픈(동결 해제) — 3h 폴링 + 버블맵 딥 밴드(lazy 로드) + 상세 페이지(deep 스냅샷 조회). **sitemap 등재는 보류** (색인 확대는 ko 유입 신호 후 별도 판단) | (해제됨) |
| ja 로케일 오픈 | JPY(cc=jp) 통화 확장과 반드시 동시 진행 (일본어 게임명 확보) | Launch 트래픽 검증 후, 확장 1순위 |
| zh 로케일 오픈 | 대만·홍콩권 타깃 | ja 오픈 성과 확인 후 |
| ~~en SEO 투자~~ / 유럽어 | ~~en~~은 2026-07 사용자 결정으로 오픈됨(동결 해제). 유럽어는 SteamDB·steamcharts 정면 경쟁 구간 | (en 완료) / 유럽어는 ja/zh 성과 증명 후 |
| 세일 이벤트 트리거 | Tier 1 할인 비율 급증 감지 → 전체 가격 강제 갱신 | 대형 세일 시즌 전 + 트래픽 존재 시 |
| 통화 확장 (EUR/CNY 등) | cc 루프에 추가 + 로케일 기본 통화 매핑 | 해당 로케일 오픈과 동시 |
| 어필리에이트 | 정식 리셀러(Fanatical: CJ, GMG: Business) 가격 블록. 해당 통화 기준가보다 실제로 쌀 때만 노출 | 상세 페이지 축적 + 검색 유입 발생 후 프로그램 승인 |
| 스포트라이트 직판 | 인디 신작 기간보장형 슬롯 (레이아웃 자리만 선확보, 셀프 프로모션으로 채움) | 게임사 쪽에서 먼저 노출 문의 |
| 큐레이터 캠페인 (야핑) | 자체 사이트 리더보드 + 개발사 캠페인 패키지 (보상=키+평판, 리포트=자체 데이터) | 스포트라이트 실판매 후 컨시어지 1건부터 |
| Pro 기능 | 장기 추이 차트, 워치리스트 알림, CSV/API 액세스 | 히스토리 6개월+ 축적 |

## 9. 수익화 로드맵 (참고용 — 지금 구현할 것 없음)

1. 애드센스 (승인 요건 = Phase 4 상세 페이지) → ko 트래픽엔 카카오 AdFit 병행 검토
2. 어필리에이트 → 3. 스포트라이트 직판 → 큐레이터 캠페인 → 4. Pro/B2B (모두 8번 트리거 준수)

## 10. 투입 관리

- v2로 범위가 커졌으므로 이전의 "주말 2회 MVP" 캡은 폐기. 대신 **Phase 단위 배포 원칙**: 각 Phase 완료 시마다 프로덕션 배포하고, Phase 2 완료 시점(버블맵 공개 가능)에 바이럴 테스트 1회 실행.
- 런칭 3개월 시점 Search Console 노출 우상향 아니면 신규 개발 동결, 크론만 유지 (데이터 자산 축적은 계속).
