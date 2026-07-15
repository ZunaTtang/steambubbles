CREATE TABLE "app_genres" (
	"appid" integer NOT NULL,
	"genre_id" integer NOT NULL,
	CONSTRAINT "app_genres_appid_genre_id_pk" PRIMARY KEY("appid","genre_id")
);
--> statement-breakpoint
CREATE TABLE "apps" (
	"appid" integer PRIMARY KEY NOT NULL,
	"name_en" text,
	"name_ko" text,
	"header_image" text,
	"is_free" boolean DEFAULT false NOT NULL,
	"tier" smallint DEFAULT 3 NOT NULL,
	"last_seen_rank" integer,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "circuit_state" (
	"domain" text PRIMARY KEY NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"open_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "genre_i18n" (
	"genre_id" integer NOT NULL,
	"locale" text NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "genre_i18n_genre_id_locale_pk" PRIMARY KEY("genre_id","locale")
);
--> statement-breakpoint
CREATE TABLE "genres" (
	"id" integer PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text NOT NULL,
	"rows" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_daily" (
	"appid" integer NOT NULL,
	"date" date NOT NULL,
	"peak" integer NOT NULL,
	"avg" integer NOT NULL,
	CONSTRAINT "player_daily_appid_date_pk" PRIMARY KEY("appid","date")
);
--> statement-breakpoint
CREATE TABLE "player_hourly" (
	"appid" integer NOT NULL,
	"hour_ts" timestamp with time zone NOT NULL,
	"peak" integer NOT NULL,
	"avg" integer NOT NULL,
	CONSTRAINT "player_hourly_appid_hour_ts_pk" PRIMARY KEY("appid","hour_ts")
);
--> statement-breakpoint
CREATE TABLE "player_snapshots" (
	"appid" integer NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"players" integer NOT NULL,
	CONSTRAINT "player_snapshots_appid_ts_pk" PRIMARY KEY("appid","ts")
);
--> statement-breakpoint
CREATE TABLE "prices" (
	"appid" integer NOT NULL,
	"cc" text NOT NULL,
	"currency" text NOT NULL,
	"price" integer NOT NULL,
	"price_initial" integer NOT NULL,
	"discount_percent" smallint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prices_appid_cc_pk" PRIMARY KEY("appid","cc")
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"appid" integer PRIMARY KEY NOT NULL,
	"review_score" smallint NOT NULL,
	"total_positive" integer DEFAULT 0 NOT NULL,
	"total_negative" integer DEFAULT 0 NOT NULL,
	"total_reviews" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_genres" ADD CONSTRAINT "app_genres_appid_apps_appid_fk" FOREIGN KEY ("appid") REFERENCES "public"."apps"("appid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_genres" ADD CONSTRAINT "app_genres_genre_id_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "genre_i18n" ADD CONSTRAINT "genre_i18n_genre_id_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_appid_apps_appid_fk" FOREIGN KEY ("appid") REFERENCES "public"."apps"("appid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_appid_apps_appid_fk" FOREIGN KEY ("appid") REFERENCES "public"."apps"("appid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "apps_tier_last_seen_rank_idx" ON "apps" USING btree ("tier","last_seen_rank");--> statement-breakpoint
CREATE INDEX "player_snapshots_ts_idx" ON "player_snapshots" USING btree ("ts");