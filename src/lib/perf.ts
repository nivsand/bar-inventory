/**
 * Lightweight request/DB profiling helpers.
 *
 * Everything here is OFF in production unless explicitly enabled, and is
 * observation-only: it never changes a response body, status or headers.
 *
 * Env flags (see .env.example):
 *   API_TIMING=1|0        -> per-request timing logs. Default: on in dev, off in prod.
 *   API_TIMING_SLOW_MS=n  -> only log requests slower than n ms. Default: 0 (log all).
 *   PRISMA_LOG_QUERIES=1  -> print every SQL statement + its duration.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";

type PerfStore = { dbMs: number; dbCount: number };

const store = new AsyncLocalStorage<PerfStore>();

function flag(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultValue;
  return raw === "1" || raw.toLowerCase() === "true";
}

const isProd = process.env.NODE_ENV === "production";

/** Per-request timing logs: on in dev by default, opt-in only in production. */
export const API_TIMING_ENABLED = flag("API_TIMING", !isProd);

/** Prisma SQL logging: opt-in everywhere (noisy). */
export const PRISMA_QUERY_LOG_ENABLED =
  flag("PRISMA_LOG_QUERIES", false) || process.env.BENCHMARK_INSTRUMENT === "1";

const SLOW_MS = Number(process.env.API_TIMING_SLOW_MS ?? 0) || 0;

/** Called by the Prisma extension for every operation. No-op outside a tracked request. */
export function recordDbTime(ms: number): void {
  const current = store.getStore();
  if (!current) return;
  current.dbMs += ms;
  current.dbCount += 1;
}

/** Read the DB totals accumulated so far in the current request, if any. */
export function currentDbTotals(): PerfStore | undefined {
  const current = store.getStore();
  return current ? { ...current } : undefined;
}

/** Content types whose body we are willing to buffer to measure its size. */
const MEASURABLE = /^(application\/json|text\/|application\/xml)/i;

async function responseSize(res: Response): Promise<number | null> {
  const declared = res.headers.get("content-length");
  if (declared) {
    const n = Number(declared);
    if (Number.isFinite(n)) return n;
  }
  if (!res.body) return 0;
  const type = res.headers.get("content-type") ?? "";
  if (!MEASURABLE.test(type)) return null; // binary/stream: don't buffer it
  try {
    return (await res.clone().arrayBuffer()).byteLength;
  } catch {
    return null;
  }
}

function fmt(ms: number): string {
  return `${ms.toFixed(1)}ms`;
}

function fmtBytes(bytes: number | null): string {
  if (bytes === null) return "n/a";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

type RouteHandler = (...args: any[]) => Response | Promise<Response>;

/**
 * Wrap an App Router handler so it logs `route | total | db | size` once per
 * request. Returns the handler untouched when timing is disabled, so the
 * production code path is exactly what it was before.
 */
export function withRouteTiming<T extends RouteHandler>(
  method: string,
  route: string,
  handler: T
): T {
  if (!API_TIMING_ENABLED) return handler;

  const wrapped = async (...args: Parameters<T>): Promise<Response> => {
    const perf: PerfStore = { dbMs: 0, dbCount: 0 };
    const startedAt = performance.now();

    return store.run(perf, async () => {
      let res: Response;
      try {
        res = await handler(...args);
      } catch (err) {
        const totalMs = performance.now() - startedAt;
        console.log(
          `[perf] ${method} ${route} total=${fmt(totalMs)} db=${fmt(perf.dbMs)} (${perf.dbCount} q) THREW`
        );
        throw err;
      }

      const totalMs = performance.now() - startedAt;
      if (totalMs < SLOW_MS) return res;

      const size = await responseSize(res);
      console.log(
        `[perf] ${method} ${route} status=${res.status} total=${fmt(totalMs)} ` +
          `db=${fmt(perf.dbMs)} (${perf.dbCount} q) app=${fmt(Math.max(0, totalMs - perf.dbMs))} ` +
          `size=${fmtBytes(size)}`
      );
      return res;
    });
  };

  return wrapped as unknown as T;
}
