import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// 빌드 타임에 DATABASE_URL 없이도 import가 실패하지 않도록 지연 초기화
let _db: ReturnType<typeof createDb> | null = null;

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL 환경변수가 설정되지 않았습니다 (.env.example 참조)");
  }
  return drizzle(neon(url), { schema });
}

export function getDb() {
  _db ??= createDb();
  return _db;
}

export { schema };
