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

### 3. 환경변수

`.env.example`을 `.env`로 복사한 뒤 값을 채웁니다.

```bash
cp .env.example .env
```

| 변수 | 설명 | 발급처 |
|---|---|---|
| `DATABASE_URL` | Neon Postgres 연결 문자열 | https://console.neon.tech |
| `STEAM_API_KEY` | Steam Web API 키 (일 10만 콜 예산) | https://steamcommunity.com/dev/apikey |
| `CRON_SECRET` | `/api/cron/*` Bearer 인증용 랜덤 문자열 | 직접 생성 |
| `QSTASH_TOKEN` 외 2개 | QStash 스케줄 트리거 | https://console.upstash.com/qstash |
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

## 디렉토리 구조

```
src/
  app/[locale]/    # next-intl 로케일 라우팅 (Launch 오픈: ko)
  i18n/            # 로케일·통화 정책 (locales.ts), 라우팅, 요청 설정
  db/              # Drizzle 스키마(schema.ts) + Neon 클라이언트
  middleware.ts    # next-intl 로케일 미들웨어
messages/          # UI 문자열 사전 — 소스는 ko.json, 타 로케일은 빌드 전 생성
drizzle/           # 생성된 SQL 마이그레이션
```

## 개발 단계 (Launch 슬라이스)

Phase 1 기반 → 2 버블맵 → 3 Tier 2 수집 → 4 상세 페이지/SEO → 5 마감.
각 Phase 완료 시마다 프로덕션 배포. 상세 기준은 [CLAUDE.md](./CLAUDE.md) 6번 참조.
