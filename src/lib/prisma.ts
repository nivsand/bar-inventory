import { PrismaClient } from "@prisma/client";
import { PRISMA_QUERY_LOG_ENABLED, API_TIMING_ENABLED, recordDbTime } from "@/lib/perf";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaQueryLoggerAttached?: boolean;
};

// Structured SQL logs are opt-in (PRISMA_LOG_QUERIES=1 / BENCHMARK_INSTRUMENT=1).
// Otherwise we keep the previous behaviour: errors always, warnings in dev.
const logConfig = PRISMA_QUERY_LOG_ENABLED
  ? ([
      { emit: "event", level: "query" },
      { emit: "stdout", level: "error" },
      { emit: "stdout", level: "warn" },
    ] as const)
  : process.env.NODE_ENV === "development"
    ? (["error", "warn"] as const)
    : (["error"] as const);

// The returned client is a `$extends` result. It is API-compatible with
// PrismaClient for everything this app uses ($transaction, $disconnect, model
// operations), so we type it as PrismaClient to keep call sites unchanged.
// (`$on` / `$use` are not available on an extended client — they are only used
// here, on `base`, before the extension is applied.)
function createClient(): PrismaClient {
  const base = new PrismaClient({ log: logConfig as any });

  if (PRISMA_QUERY_LOG_ENABLED && !globalForPrisma.prismaQueryLoggerAttached) {
    globalForPrisma.prismaQueryLoggerAttached = true;
    (base as any).$on("query", (event: any) => {
      console.log(
        JSON.stringify({
          kind: "prisma-query",
          ts: Date.now(),
          durationMs: event.duration,
          query: String(event.query).replace(/\s+/g, " ").trim(),
          params: event.params,
          target: event.target,
        })
      );
    });
  }

  // Attribute per-operation wall time to the in-flight request (see lib/perf).
  // When timing is off the extension short-circuits to a plain pass-through.
  return base.$extends({
    name: "request-db-timing",
    query: {
      async $allOperations({ args, query }) {
        if (!API_TIMING_ENABLED) return query(args);
        const startedAt = performance.now();
        try {
          return await query(args);
        } finally {
          recordDbTime(performance.now() - startedAt);
        }
      },
    },
  }) as unknown as PrismaClient;
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
