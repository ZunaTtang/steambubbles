"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_BUBBLE_SETTINGS, type BubbleSettings } from "@/lib/types";

// 즐겨찾기·버블 설정은 클라이언트 전용 상태 → localStorage 허용 (CLAUDE.md 7)

type Updater<T> = T | ((prev: T) => T);

// SSR 안전: 초기 렌더는 initial(서버 HTML과 일치), 마운트 후 저장값 반영
export function useLocalStorage<T>(
  key: string,
  initial: T,
): [T, (next: Updater<T>) => void] {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      // 파싱 실패 시 초기값 유지
    }
  }, [key]);

  const set = useCallback(
    (next: Updater<T>) => {
      setValue((prev) => {
        const resolved =
          typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // 저장 실패(프라이빗 모드 등) 무시 — 메모리 상태만 유지
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, set];
}

const FAVORITES_KEY = "sb:favorites";

export function useFavorites(): {
  favorites: Set<number>;
  toggle: (appid: number) => void;
} {
  const [ids, setIds] = useLocalStorage<number[]>(FAVORITES_KEY, []);
  const favorites = useMemo(() => new Set(ids), [ids]);
  const toggle = useCallback(
    (appid: number) => {
      setIds((prev) =>
        prev.includes(appid)
          ? prev.filter((id) => id !== appid)
          : [...prev, appid],
      );
    },
    [setIds],
  );
  return { favorites, toggle };
}

const SETTINGS_KEY = "sb:settings";

export function useSettings(): {
  settings: BubbleSettings;
  update: (partial: Partial<BubbleSettings>) => void;
} {
  // 부분 저장 → 기본값 위에 머지 (설정 항목 추가 시 하위 호환)
  const [stored, setStored] = useLocalStorage<Partial<BubbleSettings>>(
    SETTINGS_KEY,
    {},
  );
  const settings = useMemo<BubbleSettings>(
    () => ({ ...DEFAULT_BUBBLE_SETTINGS, ...stored }),
    [stored],
  );
  const update = useCallback(
    (partial: Partial<BubbleSettings>) => {
      setStored((prev) => ({ ...prev, ...partial }));
    },
    [setStored],
  );
  return { settings, update };
}
