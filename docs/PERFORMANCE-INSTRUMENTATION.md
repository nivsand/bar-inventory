# Performance Instrumentation

Profiling setup for this app. **Nothing here optimizes anything** — it only measures.
Everything is default-off in production and observation-only (no response body,
status, header, schema, or UI change).

---

## A. What was installed

| Package | Type | Version | Why |
|---|---|---|---|
| `@vercel/speed-insights` | prod dep | ^2.0.0 | Real-user Core Web Vitals from production/preview traffic |
| `@vercel/otel` | prod dep | ^2.1.3 | Registers OpenTelemetry so Vercel Observability gets server traces |
| `@opentelemetry/api` | prod dep | ^1.9.1 | Peer dependency of `@vercel/otel` |
| `@next/bundle-analyzer` | dev dep | ^14.2.18 (pinned to Next) | Opt-in JS bundle treemap |

Nothing else. No APM agent, no logging service, no Prisma tracing preview feature
(that would have required a `schema.prisma` generator change).

---

## B. What was configured

### New files
- **`src/lib/perf.ts`** — the core. `AsyncLocalStorage` request scope, the
  `withRouteTiming()` handler wrapper, `recordDbTime()`, env-flag parsing.
- **`src/instrumentation.ts`** — Next.js instrumentation hook; calls
  `registerOTel({ serviceName: "bar-inventory" })` on the Node runtime only.

### Changed files
- **`next.config.js`** — `experimental.instrumentationHook: true` (required on
  Next 14; built-in from Next 15) and the bundle-analyzer wrapper gated on `ANALYZE=1`.
- **`src/app/layout.tsx`** — `<SpeedInsights />` added to `<body>`.
- **`src/lib/prisma.ts`** — env-toggled query logging + a `$extends`
  `$allOperations` hook that attributes per-operation wall time to the in-flight request.
- **45 API route files** — each `export async function GET(...)` became
  `async function GET__handler(...)` plus
  `export const GET = withRouteTiming("GET", "/api/…", GET__handler)`.
  Handler bodies are byte-for-byte unchanged. `/api/auth/[...nextauth]` was
  deliberately left alone.
- **`.env.example`** — documents every new flag.

### Pre-existing (from an earlier session, left in place)
- `src/components/Providers.tsx` — React `<Profiler>` gated on `NEXT_PUBLIC_BENCHMARK=1`.
- `scripts/benchmark-current.mjs`, `scripts/page-benchmark-current.mjs`.

---

## C. Environment flags

| Flag | Default | Effect |
|---|---|---|
| `API_TIMING` | on in dev, **off in prod** | Per-request `[perf]` line per API call |
| `API_TIMING_SLOW_MS` | `0` | Only log requests slower than N ms |
| `PRISMA_LOG_QUERIES` | **off everywhere** | One JSON line per SQL statement, with engine-reported duration |
| `BENCHMARK_INSTRUMENT` | off | Legacy alias — also turns on Prisma query JSON |
| `NEXT_PUBLIC_BENCHMARK` | off | Client React `<Profiler>` → `window.__REACT_RENDER_EVENTS__` |
| `ANALYZE` | off | Build-time bundle treemap |

`API_TIMING=1` in production is supported and intentional-only: it is never on
unless you set it. `API_TIMING=0` force-disables in dev.

---

## D. Using each tool

### 1. API timing logs (dev)
```bash
npm run dev
# hit the app, then watch the dev server terminal:
[perf] GET /api/inventory status=200 total=182.4ms db=141.9ms (3 q) app=40.5ms size=48.2KB
```
Fields: HTTP method, route pattern, status, total handler wall time, summed
Prisma time and query count, `app = total - db` (serialization, auth, business
logic), response size.

Noise control:
```bash
API_TIMING_SLOW_MS=200 npm run dev   # only slow requests
API_TIMING=0 npm run dev             # silence entirely
```

### 2. SQL statement log
```bash
PRISMA_LOG_QUERIES=1 npm run dev
```
Emits `{"kind":"prisma-query","durationMs":…,"query":"SELECT …","params":…}`.
Pair it with the `[perf]` line above it to see which statements make up `db=`.
**Warning:** `params` includes real query parameter values. Do not enable against
production data in a shared terminal or a log sink you don't control.

### 3. React render profiling
```bash
NEXT_PUBLIC_BENCHMARK=1 npm run dev
```
Then in the browser console:
```js
window.__REACT_RENDER_EVENTS__
  .filter(e => e.actualDuration > 16)
  .sort((a,b) => b.actualDuration - a.actualDuration)
```
Also install the React DevTools "Profiler" tab for flamegraphs — see §H.

### 4. Bundle analysis
```bash
ANALYZE=1 npm run build
```
Opens treemaps for client, server, and edge bundles (written to `.next/analyze/`).

### 5. Existing benchmark scripts
```bash
BENCHMARK_INSTRUMENT=1 npm run dev > /tmp/barinv-bench/server.log 2>&1 &
node scripts/benchmark-current.mjs        # API pass
node scripts/page-benchmark-current.mjs   # page pass
```
They expect `BENCH_BASE_URL` (default `http://localhost:3002`), `BENCH_USER`,
`BENCH_PASSWORD`, and correlate the request timings against the server log.

---

## E. Where the dashboards live

- **Speed Insights** — Vercel dashboard → your project → **Speed Insights**.
  Only collects from deployed environments (production/preview). Nothing appears
  from `localhost`. First data needs real traffic; expect a delay of minutes.
- **Observability** — Vercel dashboard → project → **Observability**. Function
  invocations, duration, error rate, and edge/route breakdowns are collected on
  all plans. Full distributed **traces** from `@vercel/otel` require
  Observability Plus; without it the OTel registration is harmless and unused.
- **Query logs** — nowhere hosted. They are `stdout` from the dev server, or
  Vercel runtime logs if you deliberately set `PRISMA_LOG_QUERIES=1` in a
  deployment. Neon's own dashboard also has a query/history view for
  server-side statement timings independent of this app.

---

## F. Reproducing a measurement

Baseline, before any optimization:

```bash
# 1. clean state
rm -rf .next
npm run build          # note the route table + First Load JS numbers

# 2. measure the server in a realistic mode
npm run start          # production build, not `next dev`
#    in another shell, with API_TIMING=1 set on the start command:
API_TIMING=1 npm run start
```

Then drive traffic and read `[perf]` lines. Rules that keep runs comparable:

1. **Discard the first hit of every route.** Prisma's first query pays connection
   setup — that showed up as ~800 ms in verification.
2. **Take the median of ≥5 hits**, not a single sample.
3. **Measure against `npm run start`, not `npm run dev`.** Dev-mode numbers
   include on-demand compilation and are 2–10× pessimistic.
4. **Keep the DB constant.** Neon autosuspends idle compute; a cold branch adds
   seconds. Warm it with one throwaway query first.
5. Record: route, median total, median db, query count, response size — the four
   fields the log already gives you.

For client-side: Chrome DevTools → Performance → record a navigation, plus
Lighthouse in a clean profile. Compare against Speed Insights field data once
deployed; lab and field numbers will differ and both matter.

---

## G. Metrics worth watching

**Server**
- `db` as a fraction of `total` — splits "slow query" from "slow code".
- **Query count per request.** Any route logging double-digit `q` is an N+1.
  This is the highest-value signal in the whole setup.
- `app` time — JSON serialization and business logic.
- Response size — `/api/inventory` returns every item with `category`, `supplier`,
  and `location` joined; watch its payload.

**Client (Speed Insights)**
- LCP, INP, CLS at p75 — the thresholds that define "good" are LCP ≤ 2.5 s,
  INP ≤ 200 ms, CLS ≤ 0.1.
- Route-level breakdown — which pages are worst, not just the site average.

**Vercel Observability**
- Function duration p75/p99 and invocation count per route.
- Error rate and cold-start frequency.

**Build**
- First Load JS per route from `npm run build` output; treat regressions as bugs.

---

## H. Limitations — read before trusting a number

1. **`db` is wall time, not database time.** It measures the full Prisma
   operation including network round-trip to Neon. For a serverless Postgres
   over the network that round-trip can dominate the actual query execution.
   `PRISMA_LOG_QUERIES=1` gives the engine-reported statement duration, which is
   closer to true DB time — compare the two to see network overhead.
2. **Timing starts inside the route handler.** Auth middleware, Next.js routing,
   TLS, and cold-start time are all excluded. Vercel Observability's function
   duration includes them; the two will not match.
3. **Response size buffers the body** for JSON/text responses via `res.clone()`.
   Binary and streaming responses report `n/a` — deliberately, to avoid holding
   a large body in memory. `/api/reports/[type]` returns CSV as `text/*`, so it
   *is* buffered; the OCR upload route is not.
4. **`/api/auth/[...nextauth]` is not instrumented.** Its handler is constructed
   by NextAuth, and wrapping it risks breaking the auth flow. Login cost is
   therefore invisible to `[perf]` — note that `authorize()` does a `findUnique`
   plus a bcrypt compare, and bcrypt is intentionally slow.
5. **The Prisma extension is always installed**, and short-circuits to a plain
   pass-through when timing is off. Overhead in that state is one boolean check
   per query — real but immeasurable.
6. **`prisma` is exported cast to `PrismaClient`.** The runtime object is an
   extended client. Consequence: `$on()` and `$use()` are not available on the
   exported client (nothing in this codebase uses them; the query logger attaches
   to the base client before extension). If you ever need `$use`, this is the
   line to revisit.
7. **Speed Insights collects nothing locally**, and sampling on the free tier
   means low-traffic routes may show no data at all.
8. **OTel traces need Observability Plus.** Without it `@vercel/otel` is inert
   overhead — small, but it is not doing anything for you.
9. **Dev-mode numbers are not production numbers.** See §F.
10. **Pre-existing build warnings.** `npm run build` prints
    `DYNAMIC_SERVER_USAGE` for `/api/audit` and `/api/sales/mappings`. These
    predate this work (verified by rebuilding with those two files reverted to
    `HEAD`) and are harmless — both routes are correctly marked `ƒ` dynamic.
    They exist because those files lack the `export const dynamic = "force-dynamic"`
    line most other routes have.

---

## I. Worth adding before optimization starts

Ranked by value, none installed yet — all are your call:

1. **React DevTools browser extension** — the `<Profiler>` hook here gives raw
   numbers; DevTools gives the flamegraph that tells you *which component*.
   Zero code change.
2. **Neon's query insights** — the Neon console already tracks slow statements
   and index usage server-side. Free, no install, and it is the authoritative
   source for "is this query itself slow" versus "is the network slow".
3. **`prisma studio`** (`npx prisma studio`) — already available via the
   installed CLI; useful for sanity-checking row counts behind a slow route
   before assuming an index is missing.
4. **`EXPLAIN ANALYZE` runs** on the two or three worst queries the logs
   surface. No tooling needed, highest signal per minute spent.
5. **Optional: `@vercel/analytics`** — page-view traffic. Only worth it if you
   want to weight optimization by which routes are actually used.
6. **Optional: k6 or autocannon** — load testing. Only once single-request
   numbers are understood; concurrency findings mislead before then.

Deliberately *not* recommended yet: Sentry/Datadog/New Relic. They are the right
answer for a production incident-response story, not for a one-off profiling
pass, and they add real runtime overhead.
