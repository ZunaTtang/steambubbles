# 스팀 동접 버블맵 (steambubbles)

스팀 게임의 **동접(인기 신호) × 할인(구매 신호)** 을 결합한 다국어 발견 도구.
프로젝트의 모든 결정사항·제약은 [CLAUDE.md](./CLAUDE.md)가 단일 기준 문서입니다.

**🟢 라이브: https://steambubbles.vercel.app** (프로덕션 · **ko + en** 오픈)

## 현재 상태

- **Launch 슬라이스(Phase 1~5) 프로덕션 라이브 완료.** 자동 동접 수집(top ~3,000 — Tier 1 30분 · Tier 2 30분 · Tier 3 3시간) + 버블맵·랭킹 테이블·게임 상세(소개·데이터 대시보드) + **오늘의 무버스·버블 뽑기·떡상 공유**(재방문 콘텐츠) + 온디맨드 갱신 + SEO(sitemap·hreflang·JSON-LD·동적 OG·브랜드 검색 최적화) + 공유/스크린샷 + Analytics가 무인으로 가동 중.
- **로케일**: `ko`(기본) + `en` 오픈. `ja`/`zh`·유럽어는 동결(트리거 대기).
- **남은 운영 작업**: Discord 알림 연결(`ALERT_WEBHOOK_URL` 환경변수), Google Search Console 등록 + 색인 요청(브랜드·파비콘 반영 확인 겸 ko 노출 추이 계기판), 애드센스 신청(유입 축적 후). *(Vercel Web Analytics는 활성 확인됨.)*

## 기술 스택

| 영역 | 선택 |
|---|---|
| 프레임워크 | Next.js 15 (App Router) + TypeScript |
| 스타일 | Tailwind CSS v4 |
| i18n | next-intl — `/ko`·`/en` 오픈 (구조는 ja/zh·유럽어 확장 대비) |
| DB | Neon Postgres (serverless) + Drizzle ORM |
| 수집 트리거 | Upstash QStash → `/api/cron/*` Route Handler |
| 시각화 | d3-force + PixiJS (Canvas/WebGL) |
| 배포 | Vercel (프로덕션 빌드는 webpack) |

## 로컬 개발 환경

### 1. 요구사항

- Node.js 20 이상
- npm

### 2. 설치

```bash
npm install
```

### 3. 환경변수 — 없어도 실행됩니다 (목업 모드)

**`DATABASE_URL`이 없으면 자동으로 목업 데이터 모드로 동작합니다** (1,000개 게임 fixture, `src/mocks/games.json`). 실제 키 없이 `npm run dev`만으로 전체 UI를 확인할 수 있고, 화면 하단에 "목업 데이터 모드" 뱃지가 표시됩니다. 실데이터 전환은 `.env`에 값을 채우는 것만으로 이뤄집니다.

`.env.example`을 `.env`로 복사한 뒤 값을 채웁니다.

```bash
cp .env.example .env
```

| 변수 | 설명 | 발급처 |
|---|---|---|
| `DATABASE_URL` | Neon Postgres 연결 문자열. **비우면 목업 모드** | https://console.neon.tech |
| `USE_MOCK_DATA` | `1`이면 DATABASE_URL이 있어도 목업 모드 강제 (선택) | — |
| `STEAM_API_KEY` | Steam Web API 키 (일 10만 콜 예산) | https://steamcommunity.com/dev/apikey |
| `CRON_SECRET` | `/api/cron/*` Bearer 인증용 랜덤 문자열 | 직접 생성 |
| `QSTASH_TOKEN` | QStash 스케줄·체이닝 토큰 | https://console.upstash.com/qstash |
| `QSTASH_URL` | QStash 지역 엔드포인트 (예: `https://qstash-us-east-1.upstash.io`) — SDK baseUrl에 필수 | 위 콘솔 |
| `SITE_URL` | QStash 체이닝 콜백용 베이스 URL (배포 시) | — |
| `ALERT_WEBHOOK_URL` | 데드맨스위치·서킷브레이커 알림용 Discord 웹훅 (미설정 시 런타임 로그로 폴백) | 개인 Discord 서버 |
| `DETAILS_TIME_BUDGET_MS` | details 크론 홉당 처리 시간 예산 (선택, 기본 4000=Hobby 안전). Pro 전환 시 상향(예: 45000)하면 홉당 처리량↑·QStash 메시지↓ | — |
| `DETAILS_MAX_APPS_PER_SWEEP` | details 한 스윕 처리 앱 상한 (선택, 기본 100). QStash 무료 일일 한도를 details가 혼자 소진해 tier1/tier2를 굶기는 것을 방지 | — |

### 4. DB 스키마 반영

```bash
npm run db:push       # 개발 초기: 스키마를 Neon에 직접 반영
# 또는 마이그레이션 기반:
npm run db:generate   # ./drizzle 에 SQL 마이그레이션 생성
npm run db:migrate    # 마이그레이션 적용
```

### 5. 개발 서버

```bash
npm run dev
```

http://localhost:3000 접속 시 브라우저 언어에 따라 `/ko` 또는 `/en`으로 리다이렉트됩니다.

## 스크립트

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 (Turbopack) |
| `npm run build` | 프로덕션 빌드 |
| `npm run lint` | ESLint |
| `npm run db:push` | Drizzle 스키마를 DB에 직접 반영 |
| `npm run db:generate` / `db:migrate` | 마이그레이션 생성 / 적용 |
| `npm run db:studio` | Drizzle Studio (DB 브라우저) |
| `node scripts/generate-mock-games.mjs` | 목업 게임 fixture 재생성 (결정론적 시드) |

## 운영 · 유지보수

방치형 운영이 전제지만, 아래 의존 관계 중 하나라도 끊기면 **수집이 조용히 멈춘다.** 증상과 점검 순서를 정리한다.

### 의존 관계

```
QStash 스케줄 (us-east-1, Authorization: Bearer CRON_SECRET)
  └─▶ Vercel /api/cron/*  (Vercel 환경변수 CRON_SECRET과 일치해야 함, 아니면 401)
        └─▶ Neon Postgres (DATABASE_URL) ── 쓰기가 끊기면 무료 플랜이 며칠 뒤 브랜치를 아카이브
              └─▶ 서빙: 최근 4시간 스냅샷만 표시 → 수집이 멈추면 버블맵이 빈 화면
```

### 프로덕션 필수 환경변수 (Vercel → Settings → Environment Variables, Production)

`DATABASE_URL` · `STEAM_API_KEY` · `CRON_SECRET` · `QSTASH_TOKEN` · `QSTASH_URL` · `SITE_URL` (+ 선택 `ALERT_WEBHOOK_URL`)

- 환경변수를 바꾸면 **반드시 재배포**해야 반영된다 (Deployments → ⋯ → Redeploy).
- `CRON_SECRET`은 QStash 스케줄 헤더에 저장된 값과 같아야 한다. 바꿨다면 `scripts/resign-schedules.mjs`로 스케줄도 재서명.
- `QSTASH_TOKEN`은 **US Region** 콘솔 값 (EU 토큰 · 잘린 복사본은 `invalid token`). 콘솔의 복사 버튼으로 복사할 것.
- 로컬 `.env`에도 같은 `CRON_SECRET`·`QSTASH_TOKEN`을 두면 아래 점검 스크립트를 로컬에서 바로 돌릴 수 있다.

### 점검 · 복구 스크립트

| 명령 | 용도 |
|---|---|
| `node --env-file=.env scripts/check-pipeline.mjs` | 읽기 전용 헬스 점검 — 잡별 마지막 성공, 데이터 신선도, QStash 스케줄·DLQ. DB를 쿼리하므로 아카이브된 Neon을 깨우는 효과도 있음 |
| `node --env-file=.env scripts/resign-schedules.mjs [--apply]` | 스케줄 Authorization 헤더를 현재 `CRON_SECRET`으로 재서명 (기본 dry-run) |
| `node --env-file=.env scripts/restore-schedules.mjs [--apply]` | 소실된 스케줄을 목표 목록대로 재생성 (기본 dry-run, 있는 건 건드리지 않음) |
| `node --env-file=.env scripts/align-schedules.mjs [--apply]` | 스케줄 cron을 Neon 공유 깨움 창(:13/:43)으로 정렬 (기본 dry-run, 헤더·body 보존) |

`QSTASH_URL`/`SITE_URL`이 로컬 `.env`에 없으면 명령 앞에 `QSTASH_URL=https://qstash-us-east-1.upstash.io SITE_URL=https://steambubbles.vercel.app`을 붙인다.

### 증상별 점검 순서

1. **버블맵이 비었다 / "조건에 맞는 게임이 없습니다"** → `check-pipeline.mjs`로 `players-tier1` 마지막 성공 시각 확인.
2. **수집이 멈췄다** → Upstash 콘솔 → QStash(US) → Logs에서 크론 응답 코드 확인.
   - `401 unauthorized` → Vercel 환경변수 누락 또는 `CRON_SECRET` 불일치. 환경변수 확인 → 재배포.
   - 스케줄이 없음 → `restore-schedules.mjs`.
   - `5xx` → Vercel Logs에서 함수 오류 확인.
3. **Neon "Branch archived"** → 쿼리 한 번이면 자동 복귀 (`check-pipeline.mjs` 실행). 단 수집을 살리지 않으면 며칠 뒤 다시 아카이브된다.
4. **"가격 정보 일시 미제공"** → 가격 갱신이 3일 넘게 없을 때의 의도된 강등. `details` 크론(일 1회)이 돌면 자동 해제.
5. 복구 후 `players-tier1`을 수동으로 한 번 호출하면 즉시 데이터가 찬다:
   `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://steambubbles.vercel.app/api/cron/players-tier1`
   (tier2를 호출하면 체이닝으로 tier3까지 이어서 돈다. API 응답은 CDN에서 최대 5분 캐시된다.)

### Neon 무료 한도 관리

Neon 무료 플랜의 병목은 스토리지가 아니라 **컴퓨트 시간**이다. scale-to-zero는 마지막 쿼리 5분 뒤에 재우지만 그 5분까지 과금되므로, **DB를 깨우는 횟수 = 비용**이다.

| 레버 | 현재 설정 | 효과 |
|---|---|---|
| 크론 깨움 창 정렬 | 모든 스케줄을 `:13`/`:43`(UTC)에 몰아 둠 — tier1·tier2 `13,43 * * * *`, healthcheck·details `13 15 * * *`, universe·maintenance `43 15 * * *` | 시간당 깨움 ~4회 → 2회. tier3는 tier2가 같은 창에서 이어 실행 |
| 방문자 읽기 캐시 | `src/lib/data/index.ts` `unstable_cache` 30분(장르·추적 목록 1시간), `/api/bubbles`·`/api/trend` CDN 15분 | 방문 트래픽이 DB를 깨우는 빈도를 수집 주기 이하로 제한 |
| 컴퓨트 크기 | Neon 콘솔 → Branch → Compute → **최대 0.25 CU 고정 권장** | 무료 한도는 CU-시간 단위라 오토스케일 상한이 높으면 같은 시간도 몇 배로 소모 |

예상치: 하루 깨움 48회 × 약 6분 ≈ 월 145시간 (0.25 CU 기준 약 36 CU-시간).

**규칙**: 새 크론은 반드시 `:13`/`:43` 창에 넣고, 데이터 캐시를 수집 주기(30분)보다 짧게 두지 않는다. 사용량은 Neon 콘솔 → Billing/Usage에서 월 중순에 한 번 확인한다.

### 장애 이력

- **2026-10-26 ~ 11-19 수집 전면 중단 (24일)** — Vercel 프로젝트에 환경변수가 하나도 없는 상태로 배포돼(10/29 재생성 추정) 모든 크론이 401. 쓰기가 끊긴 Neon이 아카이브됨. 환경변수 6개 복구 + 재배포로 해결, QStash 스케줄은 손댈 필요 없었음.
- **교훈 / 남은 위험**: 데드맨스위치(`healthcheck`)가 감시 대상과 같은 QStash로 트리거되고 `ALERT_WEBHOOK_URL`도 없어 24일간 아무 알림이 없었다. 웹훅이 없으면 이제 최소한 Vercel 런타임 로그에 `[steambubbles][ALERT]`로 남는다. 근본 대책(독립 트리거의 외부 업타임 모니터 + Discord 웹훅)은 미착수.

## 디렉토리 구조

```
src/
  app/[locale]/         # 로케일 라우팅 (ko·en) — 버블맵 홈 · game/[appid] 상세 · about · privacy
  app/sitemap.ts        # 동적 sitemap (홈+정적+게임, 로케일별)   app/robots.ts
  app/api/bubbles/      # 버블맵 스냅샷 API (기간·통화별)   app/api/trend/  게임별 추이 API
  app/api/cron/         # players-tier1(30분) · players-tier2(30분) · players-tier3(3시간) · details · universe · maintenance · healthcheck
  components/bubble-map/ # PixiJS + d3-force 버블맵 렌더러 (탭=선택 / 드래그=버블 이동 / hover=툴팁)
  components/app/       # 상단 바(언어·통화·필터), 모달, 랭킹 테이블, 앱 셸
  lib/                  # types(계약), fetch-util(백오프+서킷브레이커), circuit(DB 지속화), steam, format, site
  lib/data/             # 데이터 프로바이더 — index(스위치) / mock / db
  mocks/                # 목업 fixture (games.json 1,000개, genres.json)
  i18n/                 # 로케일·통화 정책 (locales.ts — OPEN_LOCALES), 라우팅, 요청 설정
  db/                   # Drizzle 스키마(schema.ts) + Neon 클라이언트
  middleware.ts         # next-intl 로케일 미들웨어 (언어 감지)
messages/               # UI 문자열 사전 — ko.json / en.json
drizzle/                # 생성된 SQL 마이그레이션
scripts/                # 목업 fixture 생성기
```

## 로드맵 — Launch 슬라이스

각 Phase 완료 시 프로덕션 배포. 상세 기준은 [CLAUDE.md](./CLAUDE.md) 6번, Phase별 체크리스트는 GitHub 이슈로 추적.
**Phase 1~5 전부 라이브 — Launch 슬라이스 완료** (노출 우선 전략으로 Phase 4를 3보다 먼저 진행).

### Phase 1 — 기반 ([#1](https://github.com/ZunaTtang/steambubbles/issues/1)) ✅ LIVE

- [x] Next.js 15 + next-intl + Neon/Drizzle 스키마·마이그레이션
- [x] fetch 유틸(지수 백오프 + DB 지속화 서킷브레이커 + 지터) + `job_runs`
- [x] `players-tier1` 수집 + 데드맨스위치 헬스체크 핸들러
- [x] Neon + Vercel + QStash 연결 — **자동 적재 검증 완료** (주기 30분 — 2026-10 Neon 무료 compute 절감)
- [ ] Discord 웹훅(`ALERT_WEBHOOK_URL`) → 중단 알림 활성화

### Phase 2 — 버블맵 + 랭킹 테이블 ([#2](https://github.com/ZunaTtang/steambubbles/issues/2)) ✅ LIVE

- [x] d3-force + PixiJS 버블맵 (cryptobubbles 문법, 할인 링, 팬/줌/핀치)
- [x] 범위/장르/기간 필터 · 검색(자동완성) · 즐겨찾기 · 통화 전환(쿠키)
- [x] 랭킹 테이블(정렬·우아한 강등) / 상세 모달(추이 스파크라인)
- [x] **UI 개선**: 버블 내부 = 동접 수 + 순위(#N)(점유율 제거) · hover 툴팁(동접·순위·변화율·점유율) · 장르 필터 정리(SW 카테고리 제외) · 버블 드래그 ↔ 맵 팬 분리
- [x] **모바일 UX**: 필터 바 상시 노출(가로 스크롤) · 터치 제스처 분리(스와이프=팬 / 롱프레스=버블 드래그 / hover는 마우스·펜) · 버블 텍스트 원내 폭 맞춤(전각 대응) · 뷰 리셋 버튼 · 랭킹 테이블 바로가기 · **상단 바 문서 레벨 고정(sticky — 랭킹 스크롤 중에도 필터·검색·기간 유지, 헤더 높이 실측으로 맵 영역 배분)**
- [x] **딥 랭크 가독성**: 줌 기반 LOD(화면 반경 판정 + 텍스트 카운터 스케일 재래스터) · 순위 세분화(301~500/501~750/751~1,000, 구간당 ≤250) · 노드 수 기반 반경 면적 예산(균등 축소, sqrt 비율 보존)
- [x] **버블 뽑기**: 순위 범위 지정 무작위 게임 추첨 (CS:GO 케이스 오프닝식 벨트 룰렛 + 희귀도 티어 링(범위 내 백분위), GameModal 연계 — 재방문 콘텐츠)
- [x] **모션 폴리시** (emil-design-eng): 모달·드롭다운 진입 애니메이션(scale-in + 페이드, 커스텀 ease-out `cubic-bezier(0.23,1,0.32,1)`) · 버튼 press 피드백(active scale) · `@starting-style` + reduced-motion 분기. 버블맵 캔버스는 성능상 제외
- [ ] 성능 실측 60fps / 모바일 30fps+ (수동) · 바이럴 테스트 1회

### Phase 3 — Tier 2 수집 ([#3](https://github.com/ZunaTtang/steambubbles/issues/3)) ✅ LIVE

- [x] `GetGamesByConcurrentPlayers` 실테스트(→ Tier 1 1콜 최적화) · CLAUDE.md 기록
- [x] 유니버스(SteamSpy) + Tier 2 30분 폴링(keyset 배치·체이닝) + 이름/헤더 시드
- [x] player_daily 롤업 + 45일 보존(maintenance) · tier1=현재 top100 유지
- [x] 버블맵 **~3,000게임 전범위** 라이브 (Tier 3 오픈 2026-07 — 딥 밴드 lazy 로드, 유니버스 SteamSpy 3페이지)
- [ ] (후행) Tier 2 가격·한글명 details 갱신 — QStash 무료 한도상 보류

### Phase 4 — 상세 페이지 + SEO ([#4](https://github.com/ZunaTtang/steambubbles/issues/4)) ✅ LIVE

- [x] `/[locale]/game/[id]` — **게임 소개**(Steam short_description, 로케일별) + **데이터 대시보드**(현재 동접 히어로·24h 피크·순위·스팀 점유율·가격/할인·평점 긍정률 바·출시일) + 추이·장르·Steam 링크. 동접 수치는 줄글 대신 데이터로 (소개 미수집 시 순위·평점·가격 폴백 문장)
- [x] 소개 수집: 기존 appdetails 호출에 `short_description`·`release_date` 파싱 추가(추가 API 콜 0) → `apps.desc_ko/desc_en/release_date`. HTML 엔티티·태그 정리(수집·렌더 양쪽)
- [x] **모바일 복귀 UX**: 고정 뒤로가기 바 + 스마트 백(앱 내부 진입=`router.back()` 위치·스크롤 복원 / SEO 직접 유입=홈 push)
- [x] hreflang(ko/en/x-default) · sitemap · robots · VideoGame JSON-LD · canonical/OG
- [x] on-demand ISR (빌드 프리렌더 제거 — 빌드 시 Neon 부하 회피) · 개인정보·소개 페이지
- [ ] 애드센스 신청 (콘텐츠·유입 축적 후) + 문의 연락처

### Phase 5 — 마감 ([#5](https://github.com/ZunaTtang/steambubbles/issues/5)) ✅ LIVE

- [x] 공유/스크린샷: 버블맵 뷰포트 → 브랜드 카드(헤더·Top3·워터마크) PNG. Pixi extract + snapdom, 다운로드·Web Share·클립보드 복사
- [x] `/[locale]/og` 동적 OG 이미지 — next/og로 top 7 동접 리더보드(1200×630) + 홈 openGraph/twitter 연결
- [x] Vercel Analytics (`<Analytics/>` — 배포 환경 수집)
- [x] 우아한 강등 동작 검증 — store stale 시 가격 UI 전면 숨김(할인 링·랭킹 컬럼·모달·상세·상태 스트립) + 동접/랭킹 정상 유지 확인. 동접은 별도 도메인(api.steampowered)이라 store 장애와 독립

### Launch 이후 개선 (2026-07 · 재방문 콘텐츠 · 품질)

Phase 1~5 라이브 이후 추가된 증분. 전부 프로덕션 반영됨. 세 해자(ko SEO · 히스토리 · 공유 포맷)에 기여하는 것만.

- [x] **오늘의 무버스**: 급상승/급락 TOP 8 — 증감 **인원(Δ)** 기준 정렬·표시(%는 소규모 게임 편향이라 서브텍스트로만) + 규칙 기반 "왜" 태그(🏷️세일 > 🆕신규 > 🚀급등, LLM 무관) + 게임 썸네일. 맵과 랭킹 테이블 사이 배치, 클릭 → GameModal
- [x] **떡상 공유**: 급상승 TOP 7 공유 카드(`/[locale]/og/movers`, next/og 1200×630) — 순위 · 게임 썸네일(서버 프리페치 → data URI, 실패 시 이니셜 폴백으로 우아한 강등) · Δ · 동접. 공유 버튼은 **이미지 미리보기 모달**로 열려 다운로드 · 복사 · Web Share 제공(모바일)
- [x] **온디맨드 갱신**: 하위 순위 게임을 조회(모달/상세)하면 그 게임의 가격·평점·소개를 즉시 신선화(`/api/refresh/[appid]`). 3중 게이트(추적 대상만 · 6h 쿨다운 · store 서킷브레이커)로 남용/과금 방지 — "본 만큼 신선". 수집 로직은 details 크론과 `lib/collect.ts` 공용
- [x] **커스텀 순위 범위**: 프리셋 밴드 외 직접 입력(min/max — `[1, 3000]` clamp · 뒤집힘 정규화 · max>1,000이면 deep 스냅샷 승급). 스팬 상한은 전체 3,000까지 허용
- [x] **검색 UX**: 검색 중엔 순위 범위 밴드를 무시하고 매칭 버블 표시(현재 범위 밖 게임도 발견) + 자동완성 클릭 = "검색 확정"(그 게임 버블 고립 표시)
- [x] **구글 검색 최적화**: 사이트명을 브랜드로 고정(og:site_name · application-name · WebSite JSON-LD — 도메인 기반 "Vercel" 추론 방지) + 파비콘을 버블 로고 PNG로 교체(SVG→PNG, 크롤러 인식률) + 미들웨어가 확장자 없는 `/icon` 라우트를 로케일 리다이렉트로 깨뜨리던 버그 수정

### 로케일

- **ko**(기본) · **en** 오픈 — 색인·sitemap·hreflang·언어 전환 포함 (en은 2026-07 사용자 결정으로 오픈, CLAUDE.md 8번 동결 해제)
- `ja`/`zh`·유럽어는 동결 (트리거 대기)

### 후행 (동결 백로그 — 트리거 전 착공 금지)

ja/zh 로케일, 유럽어, 세일 감지 트리거, Tier 3 sitemap 등재, 수익화 전체. (Tier 3 수집·표시는 2026-07 오픈됨)
해제 트리거는 [CLAUDE.md](./CLAUDE.md) 8번 참조.
