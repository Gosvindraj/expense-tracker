import { useEffect, useState } from "react";

/**
 * useState that survives a reload.
 *
 * Home's period and category filters were plain state, so every cold start
 * dropped you back on "This month" regardless of what you were looking at.
 */
export function usePersistedState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial; // private mode, quota, or corrupt entry — not worth failing over
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [key, value]);

  return [value, setValue] as const;
}
