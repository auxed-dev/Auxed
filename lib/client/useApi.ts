import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';

interface Options {
  /** Poll every N ms while the tab is visible. */
  refreshMs?: number;
  /** Skip fetching (e.g. until a router param is ready). */
  enabled?: boolean;
}

const cache = new Map<string, unknown>();

/**
 * Small stale-while-revalidate hook: returns cached data immediately, refetches on mount,
 * on window focus and on an optional interval.
 */
export function useApi<T>(path: string | null, { refreshMs, enabled = true }: Options = {}) {
  const key = enabled ? path : null;
  const [data, setData] = useState<T | undefined>(() => (key ? (cache.get(key) as T | undefined) : undefined));
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState<boolean>(!!key && !cache.has(key));
  const keyRef = useRef(key);
  keyRef.current = key;

  const load = useCallback(async () => {
    const k = keyRef.current;
    if (!k) return;
    try {
      const d = await api<T>(k);
      if (keyRef.current !== k) return;
      cache.set(k, d);
      setData(d);
      setError(null);
    } catch (err) {
      if (keyRef.current !== k) return;
      setError(err instanceof ApiError ? err : new ApiError(0, 'Something went wrong.'));
    } finally {
      if (keyRef.current === k) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!key) return;
    setData(cache.get(key) as T | undefined);
    setLoading(!cache.has(key));
    load();
  }, [key, load]);

  useEffect(() => {
    if (!key) return;
    const onFocus = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    let timer: ReturnType<typeof setInterval> | undefined;
    if (refreshMs) timer = setInterval(() => document.visibilityState === 'visible' && load(), refreshMs);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
      if (timer) clearInterval(timer);
    };
  }, [key, refreshMs, load]);

  /** Optimistically replace the cached value. */
  const mutate = useCallback((next: T | ((prev: T | undefined) => T)) => {
    setData((prev) => {
      const value = typeof next === 'function' ? (next as (p: T | undefined) => T)(prev) : next;
      if (keyRef.current) cache.set(keyRef.current, value);
      return value;
    });
  }, []);

  return { data, error, loading, reload: load, mutate };
}

export function clearApiCache() {
  cache.clear();
}
