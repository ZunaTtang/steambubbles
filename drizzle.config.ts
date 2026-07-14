import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // drizzle-kit은 프로젝트 루트의 .env를 자동 로드한다
    url: process.env.DATABASE_URL!,
  },
});
