import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// DB 스키마 (CLAUDE.md 4-2 초안 + 4-1 job_runs/롤업)
// 히스토리는 git이 아니라 DB에 축적한다.
//
// updated_at 주의: $onUpdate는 db.update()에만 적용된다.
// insert().onConflictDoUpdate() upsert의 set 절에서는 updatedAt을 반드시 명시적으로 넣을 것
// — 우아한 강등(stale 판정)이 이 컬럼에 의존한다 (CLAUDE.md 3-3).

// 폴링 유니버스(추적 대상 앱). tier — 1: rank 1~100, 2: 101~1,000, 3: 1,001~3,000(후행)
export const apps = pgTable(
  "apps",
  {
    appid: integer("appid").primaryKey(),
    nameEn: text("name_en"),
    nameKo: text("name_ko"),
    headerImage: text("header_image"),
    isFree: boolean("is_free").notNull().default(false),
    tier: smallint("tier").notNull().default(3),
    lastSeenRank: integer("last_seen_rank"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("apps_tier_last_seen_rank_idx").on(t.tier, t.lastSeenRank)],
);

// Steam genre ID 원본 (~20개 소규모 고정)
export const genres = pgTable("genres", {
  id: integer("id").primaryKey(),
});

export const appGenres = pgTable(
  "app_genres",
  {
    appid: integer("appid")
      .notNull()
      .references(() => apps.appid),
    genreId: integer("genre_id")
      .notNull()
      .references(() => genres.id),
  },
  (t) => [primaryKey({ columns: [t.appid, t.genreId] })],
);

// 장르 라벨 자체 관리 사전
export const genreI18n = pgTable(
  "genre_i18n",
  {
    genreId: integer("genre_id")
      .notNull()
      .references(() => genres.id),
    locale: text("locale").notNull(),
    label: text("label").notNull(),
  },
  (t) => [primaryKey({ columns: [t.genreId, t.locale] })],
);

// 통화 확장은 cc 원소 추가로 — 처음부터 (appid, cc) 복합 키 (CLAUDE.md 3-3)
export const prices = pgTable(
  "prices",
  {
    appid: integer("appid")
      .notNull()
      .references(() => apps.appid),
    cc: text("cc").notNull(),
    currency: text("currency").notNull(),
    // Steam price_overview.final — 최소 화폐 단위(센트 등)
    price: integer("price").notNull(),
    discountPercent: smallint("discount_percent").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.appid, t.cc] })],
);

// review_score 숫자(1~9)만 저장 — 표시 라벨은 i18n 사전에서 로케일별 매핑 (CLAUDE.md 3-4)
export const reviews = pgTable("reviews", {
  appid: integer("appid")
    .primaryKey()
    .references(() => apps.appid),
  reviewScore: smallint("review_score").notNull(),
  totalPositive: integer("total_positive").notNull().default(0),
  totalNegative: integer("total_negative").notNull().default(0),
  totalReviews: integer("total_reviews").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// 원본 스냅샷 — 보존 30~90일 후 롤업으로 이관 (CLAUDE.md 4-1)
export const playerSnapshots = pgTable(
  "player_snapshots",
  {
    appid: integer("appid").notNull(),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    players: integer("players").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.appid, t.ts] }),
    index("player_snapshots_ts_idx").on(t.ts),
  ],
);

// 시간 단위 롤업 — 1년 보존
export const playerHourly = pgTable(
  "player_hourly",
  {
    appid: integer("appid").notNull(),
    hourTs: timestamp("hour_ts", { withTimezone: true }).notNull(),
    peak: integer("peak").notNull(),
    avg: integer("avg").notNull(),
  },
  (t) => [primaryKey({ columns: [t.appid, t.hourTs] })],
);

// 일 단위 롤업 — 영구 보존
export const playerDaily = pgTable(
  "player_daily",
  {
    appid: integer("appid").notNull(),
    date: date("date").notNull(),
    peak: integer("peak").notNull(),
    avg: integer("avg").notNull(),
  },
  (t) => [primaryKey({ columns: [t.appid, t.date] })],
);

// 수집 잡 실행 기록 — 데드맨스위치 헬스체크의 근거 (CLAUDE.md 4-1 모니터링)
export const jobRuns = pgTable("job_runs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  job: text("job").notNull(),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").notNull(),
  rows: integer("rows").notNull().default(0),
});
