import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { Buffer } from "node:buffer";
import { performance } from "node:perf_hooks";

const baseUrl = process.env.BENCH_BASE_URL || "http://localhost:3002";
const logFile = process.env.BENCH_LOG || "/private/tmp/barinv-bench/server.log";
const outFile = process.env.BENCH_OUT || "/private/tmp/barinv-bench/api-results.json";
const username = process.env.BENCH_USER || "admin";
const password = process.env.BENCH_PASSWORD || "password123";

let cookie = "";
let logOffset = existsSync(logFile) ? (await fs.stat(logFile)).size : 0;

function setCookiesFrom(res) {
  const raw = typeof res.headers.getSetCookie === "function"
    ? res.headers.getSetCookie()
    : (res.headers.get("set-cookie") ? [res.headers.get("set-cookie")] : []);
  const next = new Map(cookie.split(";").map((p) => p.trim()).filter(Boolean).map((p) => {
    const idx = p.indexOf("=");
    return [p.slice(0, idx), p.slice(idx + 1)];
  }));
  for (const header of raw) {
    const first = header.split(";")[0];
    const idx = first.indexOf("=");
    if (idx > 0) next.set(first.slice(0, idx), first.slice(idx + 1));
  }
  cookie = [...next.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function readNewQueries() {
  if (!existsSync(logFile)) return [];
  await new Promise((resolve) => setTimeout(resolve, 150));
  const stat = await fs.stat(logFile);
  if (stat.size <= logOffset) return [];
  const fh = await fs.open(logFile, "r");
  const len = stat.size - logOffset;
  const buf = Buffer.alloc(len);
  await fh.read(buf, 0, len, logOffset);
  await fh.close();
  logOffset = stat.size;
  return buf.toString("utf8")
    .split(/\r?\n/)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter((row) => row?.kind === "prisma-query");
}

async function request(path, init = {}) {
  const before = performance.now();
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), ...(cookie ? { cookie } : {}) },
    redirect: "manual",
  });
  setCookiesFrom(res);
  const text = await res.text();
  const elapsedMs = performance.now() - before;
  const queries = await readNewQueries();
  return {
    path,
    method: init.method || "GET",
    status: res.status,
    elapsedMs,
    payloadBytes: Buffer.byteLength(text),
    contentType: res.headers.get("content-type") || "",
    queryCount: queries.length,
    prismaMs: queries.reduce((sum, q) => sum + (q.durationMs || 0), 0),
    slowestQueryMs: queries.reduce((max, q) => Math.max(max, q.durationMs || 0), 0),
    slowestQuery: queries.reduce((max, q) => (q.durationMs || 0) > (max?.durationMs || 0) ? q : max, null),
    queries,
    body: text,
  };
}

async function login() {
  const csrfRes = await request("/api/auth/csrf");
  const csrf = JSON.parse(csrfRes.body).csrfToken;
  const body = new URLSearchParams({
    csrfToken: csrf,
    username,
    password,
    callbackUrl: baseUrl,
    json: "true",
  });
  const loginRes = await request("/api/auth/callback/credentials?json=true", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const sessionRes = await request("/api/auth/session");
  if (sessionRes.status !== 200 || !sessionRes.body.includes(username)) {
    throw new Error(`Login failed: status=${loginRes.status}, session=${sessionRes.body.slice(0, 120)}`);
  }
  return [csrfRes, loginRes, sessionRes].map(({ body, queries, ...row }) => row);
}

const staticEndpoints = [
  "/api/dashboard",
  "/api/inventory",
  "/api/inventory?kind=RAW",
  "/api/inventory?inCount=1&area=KITCHEN",
  "/api/inventory?archived=1",
  "/api/categories",
  "/api/locations",
  "/api/suppliers",
  "/api/suppliers?archived=1",
  "/api/users",
  "/api/counts",
  "/api/orders/suggestions",
  "/api/orders",
  "/api/prep/suggestions",
  "/api/prep/tasks",
  "/api/recipes",
  "/api/deliveries",
  "/api/waste",
  "/api/reports/inventory?format=json",
  "/api/reports/inventory-by-category?format=json",
  "/api/reports/waste?format=json",
  "/api/reports/orders?format=json",
  "/api/reports/deliveries?format=json",
  "/api/reports/sales-weekly?format=json",
  "/api/reports/sales-by-product?format=json",
  "/api/reports/sales-unmapped?format=json",
  "/api/sales/uploads",
  "/api/sales/unmapped",
  "/api/sales/mappings",
  "/api/audit",
  "/api/diagnostics/prep",
];

function stripBody(row) {
  const { body, queries, ...rest } = row;
  return rest;
}

function normalizeQuery(q) {
  return q.replace(/\s+/g, " ").replace(/\$\d+/g, "?").trim();
}

async function main() {
  await fs.mkdir("/private/tmp/barinv-bench", { recursive: true });
  const authRows = await login();
  const results = [...authRows];
  const dynamicEndpoints = [];

  for (const path of staticEndpoints) {
    const row = await request(path);
    results.push(stripBody(row));
    if (path === "/api/counts" && row.status === 200) {
      const counts = JSON.parse(row.body);
      if (counts[0]?.id) dynamicEndpoints.push(`/api/counts/${counts[0].id}`);
    }
    if (path === "/api/sales/uploads" && row.status === 200) {
      const uploads = JSON.parse(row.body);
      if (uploads[0]?.id) dynamicEndpoints.push(`/api/sales/uploads/${uploads[0].id}`);
    }
  }

  for (const path of dynamicEndpoints) {
    results.push(stripBody(await request(path)));
  }

  const allQueries = [];
  for (const path of staticEndpoints.concat(dynamicEndpoints)) {
    void path;
  }
  const fullRows = [];
  logOffset = 0;
  for (const q of await readNewQueries()) {
    allQueries.push(q);
  }
  for (const row of results) {
    fullRows.push(row);
    for (const q of row.queries || []) allQueries.push(q);
  }

  const grouped = new Map();
  for (const q of allQueries) {
    const key = normalizeQuery(q.query);
    const g = grouped.get(key) || { query: key, count: 0, totalMs: 0, maxMs: 0 };
    g.count++;
    g.totalMs += q.durationMs || 0;
    g.maxMs = Math.max(g.maxMs, q.durationMs || 0);
    grouped.set(key, g);
  }
  const slowQueries = [...grouped.values()]
    .map((g) => ({ ...g, avgMs: g.totalMs / g.count }))
    .sort((a, b) => b.maxMs - a.maxMs)
    .slice(0, 25);

  const output = {
    measuredAt: new Date().toISOString(),
    baseUrl,
    note: "GET/read-only endpoints plus auth measured. Mutation endpoints intentionally not exercised.",
    endpoints: results.map((r) => ({
      ...r,
      elapsedMs: Math.round(r.elapsedMs * 10) / 10,
      prismaMs: Math.round(r.prismaMs * 10) / 10,
    })),
    slowQueries: slowQueries.map((q) => ({
      ...q,
      totalMs: Math.round(q.totalMs * 10) / 10,
      avgMs: Math.round(q.avgMs * 10) / 10,
      maxMs: Math.round(q.maxMs * 10) / 10,
    })),
  };
  await fs.writeFile(outFile, JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
