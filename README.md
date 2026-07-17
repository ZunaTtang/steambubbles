# 스팀 동접 버블맵 (steambubbles)

스팀 게임의 **동접(인기 신호) × 할인(구매 신호)** 을 결합한 다국어 발견 도구.
프로젝트의 모든 결정사항·제약은 [CLAUDE.md](./CLAUDE.md)가 단일 기준 문서입니다.

**🟢 라이브: https://steambubbles.vercel.app** (프로덕션 · **ko + en** 오픈)

## 현재 상태

- **Phase 1~4 프로덕션 라이브.** 자동 동접 수집(top ~3,000 — Tier 1 10분 · Tier 2 30분 · Tier 3 3시간) + 버블맵·랭킹 테이블·게임 상세 페이지 + SEO(sitemap·hreflang·JSON-LD)가 무인으로 가동 중.
- **로케일**: `ko`(기본) + `en` 오픈. `ja`/`zh`·유럽어는 동결(트리거 대기).
- **남은 Launch 작업**: Phase 5(캡처/OG/Analytics), Discord 알림 연결.

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
| `ALERT_WEBHOOK_URL` | 데드맨스위치·서킷브레이커 알림용 Discord 웹훅 | 개인 Discord 서버 |

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

## 디렉토리 구조

```
src/
  app/[locale]/         # 로케일 라우팅 (ko·en) — 버블맵 홈 · game/[appid] 상세 · about · privacy
  app/sitemap.ts        # 동적 sitemap (홈+정적+게임, 로케일별)   app/robots.ts
  app/api/bubbles/      # 버블맵 스냅샷 API (기간·통화별)   app/api/trend/  게임별 추이 API
  app/api/cron/         # players-tier1(10분) · players-tier2(30분) · players-tier3(3시간) · details · universe · maintenance · healthcheck
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
**Phase 1~4 라이브, Phase 5만 남음** (노출 우선 전략으로 Phase 4를 3보다 먼저 진행).

### Phase 1 — 기반 ([#1](https://github.com/ZunaTtang/steambubbles/issues/1)) ✅ LIVE

- [x] Next.js 15 + next-intl + Neon/Drizzle 스키마·마이그레이션
- [x] fetch 유틸(지수 백오프 + DB 지속화 서킷브레이커 + 지터) + `job_runs`
- [x] `players-tier1` 수집 + 데드맨스위치 헬스체크 핸들러
- [x] Neon + Vercel + QStash 연결 — **10분 자동 적재 검증 완료**
- [ ] Discord 웹훅(`ALERT_WEBHOOK_URL`) → 중단 알림 활성화

### Phase 2 — 버블맵 + 랭킹 테이블 ([#2](https://github.com/ZunaTtang/steambubbles/issues/2)) ✅ LIVE

- [x] d3-force + PixiJS 버블맵 (cryptobubbles 문법, 할인 링, 팬/줌/핀치)
- [x] 범위/장르/기간 필터 · 검색(자동완성) · 즐겨찾기 · 통화 전환(쿠키)
- [x] 랭킹 테이블(정렬·우아한 강등) / 상세 모달(추이 스파크라인)
- [x] **UI 개선**: 버블 내부 = 동접 수 + 순위(#N)(점유율 제거) · hover 툴팁(동접·순위·변화율·점유율) · 장르 필터 정리(SW 카테고리 제외) · 버블 드래그 ↔ 맵 팬 분리
- [x] **모바일 UX**: 필터 바 상시 노출(가로 스크롤) · 터치 제스처 분리(스와이프=팬 / 롱프레스=버블 드래그 / hover는 마우스·펜) · 버블 텍스트 원내 폭 맞춤(전각 대응) · 뷰 리셋 버튼 · 랭킹 테이블 바로가기
- [x] **딥 랭크 가독성**: 줌 기반 LOD(화면 반경 판정 + 텍스트 카운터 스케일 재래스터) · 순위 세분화(301~500/501~750/751~1,000, 구간당 ≤250) · 노드 수 기반 반경 면적 예산(균등 축소, sqrt 비율 보존)
- [x] **버블 뽑기**: 순위 범위 지정 무작위 게임 추첨 (CS:GO 케이스 오프닝식 벨트 룰렛 + 희귀도 티어 링(범위 내 백분위), GameModal 연계 — 재방문 콘텐츠)
- [ ] 성능 실측 60fps / 모바일 30fps+ (수동) · 바이럴 테스트 1회

### Phase 3 — Tier 2 수집 ([#3](https://github.com/ZunaTtang/steambubbles/issues/3)) ✅ LIVE

- [x] `GetGamesByConcurrentPlayers` 실테스트(→ Tier 1 1콜 최적화) · CLAUDE.md 기록
- [x] 유니버스(SteamSpy) + Tier 2 30분 폴링(keyset 배치·체이닝) + 이름/헤더 시드
- [x] player_daily 롤업 + 45일 보존(maintenance) · tier1=현재 top100 유지
- [x] 버블맵 **~3,000게임 전범위** 라이브 (Tier 3 오픈 2026-07 — 딥 밴드 lazy 로드, 유니버스 SteamSpy 3페이지)
- [ ] (후행) Tier 2 가격·한글명 details 갱신 — QStash 무료 한도상 보류

### Phase 4 — 상세 페이지 + SEO ([#4](https://github.com/ZunaTtang/steambubbles/issues/4)) ✅ LIVE

- [x] `/[locale]/game/[id]` 자연문 자동 생성 + 추이 + 장르 + Steam 링크
- [x] hreflang(ko/en/x-default) · sitemap · robots · VideoGame JSON-LD · canonical/OG
- [x] on-demand ISR (빌드 프리렌더 제거 — 빌드 시 Neon 부하 회피) · 개인정보·소개 페이지
- [ ] 애드센스 신청 (콘텐츠·유입 축적 후) + 문의 연락처

### Phase 5 — 마감 ([#5](https://github.com/ZunaTtang/steambubbles/issues/5)) ⬜ 남음

- [ ] snapdom 캡처 + 워터마크 / `/[locale]/og` 동적 OG 이미지
- [ ] Vercel Analytics
- [ ] 우아한 강등 동작 검증 (store 장애 시 가격 UI 숨김, 동접 정상)

### 로케일

- **ko**(기본) · **en** 오픈 — 색인·sitemap·hreflang·언어 전환 포함 (en은 2026-07 사용자 결정으로 오픈, CLAUDE.md 8번 동결 해제)
- `ja`/`zh`·유럽어는 동결 (트리거 대기)

### 후행 (동결 백로그 — 트리거 전 착공 금지)

ja/zh 로케일, 유럽어, 세일 감지 트리거, Tier 3 sitemap 등재, 수익화 전체. (Tier 3 수집·표시는 2026-07 오픈됨)
해제 트리거는 [CLAUDE.md](./CLAUDE.md) 8번 참조.
