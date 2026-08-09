"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/fetcher";

type CacheEntry<T = any> = {
  data?: T;
  error?: Error;
  updatedAt: number;
  promise?: Promise<T>;
};

type Matcher = string | RegExp | ((key: string) => boolean);

const cache = new Map<string, CacheEntry>();
const listeners = new Set<(keys: Set<string>) => void>();

function matches(key: string, matcher: Matcher) {
  if (typeof matcher === "string") return key === matcher || key.startsWith(matcher);
  if (matcher instanceof RegExp) return matcher.test(key);
  return matcher(key);
}

function notify(keys: Set<string>) {
  for (const listener of listeners) listener(keys);
}

export function invalidateApiCache(matchers: Matcher | Matcher[]) {
  const list = Array.isArray(matchers) ? matchers : [matchers];
  const deleted = new Set<string>();
  for (const key of [...cache.keys()]) {
    if (list.some((matcher) => matches(key, matcher))) {
      cache.delete(key);
      deleted.add(key);
    }
  }
  if (deleted.size > 0) notify(deleted);
}

export function primeApiCache<T>(key: string, data: T) {
  cache.set(key, { data, updatedAt: Date.now() });
}

export function updateApiCache<T>(key: string, updater: (data: T | undefined) => T | undefined) {
  const current = cache.get(key);
  const next = updater(current?.data);
  if (next === undefined) cache.delete(key);
  else cache.set(key, { data: next, updatedAt: Date.now() });
}

async function loadResource<T>(key: string, force: boolean, ttlMs: number): Promise<T> {
  const now = Date.now();
  const current = cache.get(key) as CacheEntry<T> | undefined;
  const fresh = current?.data !== undefined && ttlMs > 0 && now - current.updatedAt < ttlMs;
  if (!force && fresh) return current.data as T;
  if (!force && current?.promise) return current.promise;

  const promise = api<T>(key).then((data) => {
    cache.set(key, { data, updatedAt: Date.now() });
    return data;
  }).catch((err) => {
    cache.set(key, { ...(cache.get(key) || { updatedAt: 0 }), error: err, promise: undefined });
    throw err;
  });

  cache.set(key, { ...(current || { updatedAt: 0 }), promise });
  return promise;
}

export function useApiResource<T>(
  key: string | null,
  options: { ttlMs?: number; enabled?: boolean; initialData?: T } = {}
) {
  const ttlMs = options.ttlMs ?? 0;
  const enabled = options.enabled ?? true;
  const [version, setVersion] = useState(0);
  const [data, setData] = useState<T | undefined>(() => {
    if (!key) return options.initialData;
    return (cache.get(key)?.data as T | undefined) ?? options.initialData;
  });
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(() => {
    if (!key || !enabled) return false;
    const entry = cache.get(key);
    return !(entry?.data !== undefined && ttlMs > 0 && Date.now() - entry.updatedAt < ttlMs);
  });
  const focusReloadAt = useRef(0);

  const reload = useCallback(async (force = true) => {
    if (!key || !enabled) return undefined;
    setLoading(true);
    try {
      const next = await loadResource<T>(key, force, ttlMs);
      setData(next);
      setError(null);
      return next;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [enabled, key, ttlMs]);

  useEffect(() => {
    if (!key) {
      setData(options.initialData);
      setLoading(false);
      return;
    }
    const entry = cache.get(key) as CacheEntry<T> | undefined;
    const fresh = entry?.data !== undefined && ttlMs > 0 && Date.now() - entry.updatedAt < ttlMs;
    setData(fresh ? entry.data : options.initialData);
    setLoading(enabled && !fresh);
  }, [enabled, key, options.initialData, ttlMs]);

  useEffect(() => {
    const listener = (keys: Set<string>) => {
      if (key && keys.has(key)) setVersion((v) => v + 1);
    };
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, [key]);

  useEffect(() => {
    if (!key || !enabled) return;
    const entry = cache.get(key) as CacheEntry<T> | undefined;
    const fresh = entry?.data !== undefined && ttlMs > 0 && Date.now() - entry.updatedAt < ttlMs;
    if (fresh) {
      setData(entry.data);
      setLoading(false);
      return;
    }
    reload(false).catch(() => {});
  }, [enabled, key, reload, ttlMs, version]);

  useEffect(() => {
    if (!key || !enabled || ttlMs > 0 || typeof window === "undefined") return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - focusReloadAt.current < 1000) return;
      focusReloadAt.current = now;
      reload(true).catch(() => {});
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [enabled, key, reload, ttlMs]);

  return { data, error, loading, reload, setData };
}
