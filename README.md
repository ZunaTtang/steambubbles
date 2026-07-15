# 스팀 동접 버블맵 (steambubbles)

스팀 게임의 **동접(인기 신호) × 할인(구매 신호)** 을 결합한 다국어 발견 도구.
프로젝트의 모든 결정사항·제약은 [CLAUDE.md](./CLAUDE.md)가 단일 기준 문서입니다.

## 기술 스택

| 영역 | 선택 |
|---|---|
| 프레임워크 | Next.js 15 (App Router) + TypeScript |
| 스타일 | Tailwind CSS v4 |
| i18n | next-intl — Launch는 `/ko`만 오픈 (구조는 ja/zh/en 확장 대비) |
| DB | Neon Postgres (serverless) + Drizzle ORM |
| 수집 트리거 | Upstash QStash → `/api/cron/*` Route Handler |
| 시각화 (Phase 2) | d3-force + PixiJS |
| 배포 | Vercel |

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
| `QSTASH_TOKEN` 외 2개 | QStash 스케줄 트리거 | https://console.upstash.com/qstash |
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

http://localhost:3000 접속 시 `/ko`로 리다이렉트됩니다.

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
  app/[locale]/         # 로케일 라우팅 (Launch 오픈: ko) — 메인 버블맵 + game/[appid] 상세
  app/api/bubbles/      # 버블맵 스냅샷 API (기간·통화별)
  app/api/trend/        # 게임별 동접 추이 API
  app/api/cron/         # 수집 크론: players-tier1 / details / healthcheck(데드맨스위치)
  components/bubble-map/ # PixiJS + d3-force 버블맵 렌더러
  components/app/       # 상단 바, 모달, 랭킹 테이블, 앱 셸
  lib/                  # types(계약), fetch-util(백오프+서킷브레이커), steam 클라이언트, format
  lib/data/             # 데이터 프로바이더 — index(스위치) / mock / db
  mocks/                # 목업 fixture (games.json 1,000개, genres.json)
  i18n/                 # 로케일·통화 정책 (locales.ts), 라우팅, 요청 설정
  db/                   # Drizzle 스키마(schema.ts) + Neon 클라이언트
  middleware.ts         # next-intl 로케일 미들웨어
messages/               # UI 문자열 사전 — 소스는 ko.json
drizzle/                # 생성된 SQL 마이그레이션
scripts/                # 목업 fixture 생성기
```

## 로드맵 — Launch 슬라이스 액션 아이템

각 Phase 완료 시마다 프로덕션 배포. 상세 기준·제약은 [CLAUDE.md](./CLAUDE.md) 6번이 기준이며,
Phase별 세부 체크리스트는 GitHub 이슈로 추적한다.

### Phase 1 — 기반 ([#1](https://github.com/ZunaTtang/steambubbles/issues/1)) 🔄 코드 완료, 실환경 연결 대기

- [x] Next.js 15 + next-intl 구조 (Launch 오픈은 `/ko`만)
- [x] Neon/Drizzle 스키마 + 초기 마이그레이션
- [x] 공통 fetch 유틸 (지수 백오프 + 서킷브레이커 + 지터)
- [x] `/api/cron/players-tier1` 수집 핸들러 + `job_runs` 기록
- [x] 데드맨스위치 헬스체크 핸들러 → Discord 웹훅 알림
- [ ] 실환경 연결: Neon `DATABASE_URL` + QStash 스케줄 등록 + Discord 웹훅 → **완료 기준 검증**

**완료 기준**: top 100 스냅샷 10분 주기 자동 적재 + 수집 중단 시 Discord 알림 수신 확인

### Phase 2 — 버블맵 + 랭킹 테이블 ([#2](https://github.com/ZunaTtang/steambubbles/issues/2)) 🔄 목업 모드로 동작 중

- [x] d3-force + PixiJS 버블맵 (cryptobubbles 문법, 색상 콜드스타트 폴백, 할인 링)
- [x] 가격·평점 수집 크론 핸들러 (1.6초 스로틀, QStash 체이닝)
- [x] 범위/장르/기간 필터 · 검색(자동완성) · 즐겨찾기 · 통화 전환(쿠키)
- [x] 랭킹 테이블 (정렬, 우아한 강등 시 가격 컬럼 숨김) / 상세 모달(추이 차트)
- [ ] 성능 실측: 300 노드 데스크톱 60fps / 중급 모바일 30fps+ (수동 확인 필요)
- [ ] 실데이터 연결 후 최종 검수 → **바이럴 테스트 1회** (캡처 이미지 커뮤니티 게시)

> 현재 목업 데이터 모드(1,000개 fixture)로 전체 UI가 동작한다. `DATABASE_URL` 설정 시 실데이터로 자동 전환.

### Phase 3 — Tier 2 수집 ([#3](https://github.com/ZunaTtang/steambubbles/issues/3))

- [ ] `GetGamesByConcurrentPlayers` 실테스트 → 결과 CLAUDE.md에 기록
- [ ] 폴링 유니버스 구축 + Tier 2 30분 폴링 (배치 분할 + QStash 체이닝)
- [ ] 티어 재배정(일 1회) + 롤업/보존 잡

### Phase 4 — 상세 페이지 + SEO ([#4](https://github.com/ZunaTtang/steambubbles/issues/4))

- [ ] `/[locale]/game/[id]` 상세 페이지 (로케일별 자연문 자동 생성)
- [ ] Tier 1~2 사전 생성 + on-demand ISR
- [ ] ko hreflang·sitemap, 애드센스 신청 준비

### Phase 5 — 마감 ([#5](https://github.com/ZunaTtang/steambubbles/issues/5))

- [ ] snapdom 캡처 + 워터마크 / `/[locale]/og` 동적 OG 이미지
- [ ] Vercel Analytics
- [ ] 우아한 강등 동작 검증 (store API 장애 시 가격 UI 숨김, 동접 정상)

### 후행 (동결 백로그 — 트리거 전 착공 금지)

Tier 3 오픈, ja/zh 로케일, en SEO, 세일 감지 트리거, 수익화 전체.
해제 트리거는 [CLAUDE.md](./CLAUDE.md) 8번 참조.
