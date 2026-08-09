import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { Buffer } from "node:buffer";
import { performance } from "node:perf_hooks";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const baseUrl = process.env.BENCH_BASE_URL || "http://localhost:3002";
const cdpBase = process.env.CDP_BASE || "http://127.0.0.1:9223";
const logFile = process.env.BENCH_LOG || "/private/tmp/barinv-bench/server.log";
const outFile = process.env.PHASE2_BENCH_OUT || "/private/tmp/barinv-bench/phase2-results.json";
const username = process.env.BENCH_USER || "admin@bar.local";
const password = process.env.BENCH_PASSWORD || "password123";
const countSize = Number(process.env.PHASE2_COUNT_SIZE || 500);
const salesLineSize = Number(process.env.PHASE2_SALES_LINES || 200);

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
  const started = performance.now();
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), ...(cookie ? { cookie } : {}) },
    redirect: "manual",
  });
  setCookiesFrom(res);
  const text = await res.text();
  const queries = await readNewQueries();
  return {
    path,
    method: init.method || "GET",
    status: res.status,
    elapsedMs: Math.round((performance.now() - started) * 10) / 10,
    queryCount: queries.length,
    prismaMs: Math.round(queries.reduce((sum, q) => sum + (q.durationMs || 0), 0) * 10) / 10,
    slowestQueryMs: Math.round(queries.reduce((max, q) => Math.max(max, q.durationMs || 0), 0) * 10) / 10,
    payloadBytes: Buffer.byteLength(text),
    body: text,
  };
}

async function loginHttp() {
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
  if (sessionRes.status !== 200 || !sessionRes.body.includes("user")) {
    throw new Error(`Login failed: status=${loginRes.status}, session=${sessionRes.body.slice(0, 120)}`);
  }
}

async function ensureFixture() {
  const pwd = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { username },
    update: { role: "ADMIN", isActive: true },
    create: {
      username,
      email: username.includes("@") ? username : `${username}@bar.local`,
      name: "Phase2 Bench Admin",
      role: "ADMIN",
      passwordHash: pwd,
      locale: "en",
      isActive: true,
    },
  });
  const category = await prisma.category.upsert({
    where: { id: "phase2-bench-category" },
    update: {},
    create: { id: "phase2-bench-category", nameHe: "בדיקה", nameEn: "Phase2 Bench", kind: "RAW", sortOrder: 999 },
  });
  const supplier = await prisma.supplier.upsert({
    where: { id: "phase2-bench-supplier" },
    update: { isActive: true },
    create: {
      id: "phase2-bench-supplier",
      nameHe: "ספק בדיקה",
      nameEn: "Phase2 Bench Supplier",
      orderingMethod: "EMAIL",
      orderDeadlineDays: [0, 1, 2, 3, 4, 5, 6],
      deliveryDays: [0, 1, 2, 3, 4, 5, 6],
      isActive: true,
    },
  });
  const location = await prisma.location.upsert({
    where: { nameEn: "Phase2 Bench Location" },
    update: { isActive: true },
    create: { nameHe: "מיקום בדיקה", nameEn: "Phase2 Bench Location", sortOrder: 999, isActive: true },
  });

  const existing = await prisma.inventoryItem.count({ where: { sku: { startsWith: "PHASE2-" } } });
  if (existing < countSize) {
    const data = [];
    for (let i = existing; i < countSize; i++) {
      data.push({
        nameHe: `פריט בדיקה ${i}`,
        nameEn: `Phase2 Bench Item ${String(i).padStart(4, "0")}`,
        sku: `PHASE2-${String(i).padStart(5, "0")}`,
        kind: "RAW",
        categoryId: category.id,
        supplierId: supplier.id,
        locationId: location.id,
        unit: "unit",
        currentQty: i % 25,
        minQty: 5,
        parQty: 30,
        purchasePrice: 1 + (i % 9),
        area: i % 2 ? "FLOOR" : "KITCHEN",
        inCount: true,
        isActive: true,
      });
    }
    await prisma.inventoryItem.createMany({ data, skipDuplicates: true });
  }

  const upload = await prisma.salesUpload.create({
    data: {
      source: "PASTE",
      fileName: "phase2-bench.tsv",
      rawData: "Product\tQty\n",
      periodStart: new Date("2026-08-03T00:00:00.000Z"),
      periodEnd: new Date("2026-08-09T23:59:59.999Z"),
      weekNumber: 32,
      year: 2026,
      status: "PENDING_MAPPING",
      uploadedById: user.id,
      lines: {
        create: Array.from({ length: salesLineSize }, (_, i) => ({
          posProductName: `Phase2 Bench Item ${String(i % Math.min(40, countSize)).padStart(4, "0")}`,
          quantitySold: 1 + (i % 7),
          revenue: 10 + i,
        })),
      },
    },
  });

  return { user, supplier, upload };
}

async function benchmarkCount() {
  const items = await prisma.inventoryItem.findMany({
    where: { sku: { startsWith: "PHASE2-" }, isActive: true, inCount: true },
    select: { id: true, currentQty: true },
    orderBy: { sku: "asc" },
    take: countSize,
  });
  if (items.length < countSize) throw new Error(`Only ${items.length} fixture items available`);
  const createRes = await request("/api/counts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ businessDay: new Date().toISOString() }),
  });
  const count = JSON.parse(createRes.body);
  const entries = items.map((item, i) => ({
    itemId: item.id,
    countedQty: Math.max(0, Math.round((item.currentQty + ((i % 5) - 2) * 0.25) * 1000) / 1000),
  }));
  const submit = await request(`/api/counts/${count.id}/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entries, notes: "phase2 benchmark" }),
  });
  const approve = await request(`/api/counts/${count.id}/approve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "APPROVE" }),
  });
  return { create: stripBody(createRes), submit: stripBody(submit), approve: stripBody(approve), countSize };
}

async function benchmarkSalesUnmapped() {
  const row = await request("/api/sales/unmapped");
  return { ...stripBody(row), salesLineSize };
}

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.id && this.pending.has(data.id)) {
        const { resolve, reject } = this.pending.get(data.id);
        this.pending.delete(data.id);
        data.error ? reject(new Error(JSON.stringify(data.error))) : resolve(data.result);
        return;
      }
      const list = this.listeners.get(data.method) || [];
      for (const fn of list) fn(data.params || {});
    };
  }
  on(method, fn) {
    const list = this.listeners.get(method) || [];
    list.push(fn);
    this.listeners.set(method, list);
  }
  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  close() { this.ws.close(); }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function evalValue(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

async function newPage() {
  const res = await fetch(`${cdpBase}/json/new?about:blank`, { method: "PUT" });
  if (!res.ok) throw new Error(`Could not create Chrome target: ${res.status}`);
  const target = await res.json();
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send("Page.enable");
  await cdp.send("Network.enable");
  await cdp.send("Runtime.enable");
  return cdp;
}

async function loginBrowser(cdp) {
  await cdp.send("Page.navigate", { url: `${baseUrl}/login` });
  await sleep(1000);
  const result = await evalValue(cdp, `(async () => {
    const csrf = await fetch('/api/auth/csrf', { credentials: 'include' }).then((r) => r.json());
    const body = new URLSearchParams({
      csrfToken: csrf.csrfToken,
      username: ${JSON.stringify(username)},
      password: ${JSON.stringify(password)},
      callbackUrl: location.origin,
      json: 'true',
    });
    const res = await fetch('/api/auth/callback/credentials?json=true', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      credentials: 'include',
      body,
    });
    const session = await fetch('/api/auth/session', { credentials: 'include' }).then((r) => r.json());
    return { status: res.status, hasUser: !!session?.user };
  })()`);
  if (result.status !== 200 || !result.hasUser) throw new Error(`Browser login failed: ${JSON.stringify(result)}`);
}

async function waitNetworkIdle(inflight, lastChangeRef, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (inflight.size === 0 && Date.now() - lastChangeRef.value > 800) break;
    await sleep(100);
  }
  await sleep(250);
}

async function measureNavigation(cdp, path) {
  const requests = [];
  const inflight = new Set();
  const lastChangeRef = { value: Date.now() };
  const onReq = (p) => {
    if (!p.request?.url) return;
    inflight.add(p.requestId);
    lastChangeRef.value = Date.now();
    requests.push({ id: p.requestId, url: p.request.url, method: p.request.method, type: p.type, status: null });
  };
  cdp.on("Network.requestWillBeSent", onReq);
  cdp.on("Network.responseReceived", (p) => {
    const r = requests.find((x) => x.id === p.requestId);
    if (r) r.status = p.response.status;
  });
  cdp.on("Network.loadingFinished", (p) => { inflight.delete(p.requestId); lastChangeRef.value = Date.now(); });
  cdp.on("Network.loadingFailed", (p) => { inflight.delete(p.requestId); lastChangeRef.value = Date.now(); });
  await cdp.send("Page.navigate", { url: `${baseUrl}${path}` });
  await waitNetworkIdle(inflight, lastChangeRef);
  const api = requests.filter((r) => {
    try { return new URL(r.url).pathname.startsWith("/api/"); } catch { return false; }
  });
  return { path, apiRequestCount: api.length, apiRequests: api.map((r) => new URL(r.url).pathname + new URL(r.url).search) };
}

async function measureBrowserAction(cdp, name, expression) {
  const requests = [];
  const inflight = new Set();
  const lastChangeRef = { value: Date.now() };
  cdp.on("Network.requestWillBeSent", (p) => {
    if (!p.request?.url) return;
    const url = new URL(p.request.url);
    if (!url.pathname.startsWith("/api/")) return;
    inflight.add(p.requestId);
    lastChangeRef.value = Date.now();
    requests.push({ id: p.requestId, method: p.request.method, path: url.pathname + url.search, status: null });
  });
  cdp.on("Network.responseReceived", (p) => {
    const r = requests.find((x) => x.id === p.requestId);
    if (r) r.status = p.response.status;
  });
  cdp.on("Network.loadingFinished", (p) => { inflight.delete(p.requestId); lastChangeRef.value = Date.now(); });
  cdp.on("Network.loadingFailed", (p) => { inflight.delete(p.requestId); lastChangeRef.value = Date.now(); });
  const result = await evalValue(cdp, expression);
  await waitNetworkIdle(inflight, lastChangeRef);
  return { name, result, apiRequestCount: requests.length, apiRequests: requests.map((r) => ({ method: r.method, path: r.path, status: r.status })) };
}

async function benchmarkPagesAndMutations() {
  if (typeof WebSocket !== "function") return { skipped: "Node runtime has no WebSocket" };
  try {
    const cdp = await newPage();
    await loginBrowser(cdp);

    const inventoryPage = await measureNavigation(cdp, "/inventory");
    const inventoryMutation = await measureBrowserAction(cdp, "inventory-save", `(async () => {
      const edit = Array.from(document.querySelectorAll('table tbody tr td:last-child button')).find((b) => b.offsetParent !== null);
      if (!edit) return 'no-edit-button';
      edit.click();
      for (let i = 0; i < 50 && !document.querySelector('.modal-panel .btn-primary'); i++) await new Promise((r) => setTimeout(r, 100));
      const save = document.querySelector('.modal-panel .btn-primary');
      if (!save) return 'no-save-button';
      save.click();
      return 'clicked';
    })()`);

    const ordersPage = await measureNavigation(cdp, "/orders");
    const orderMutation = await measureBrowserAction(cdp, "order-status-change", `(async () => {
      const select = Array.from(document.querySelectorAll('select')).find((s) => Array.from(s.options).some((o) => o.value === 'ORDERED'));
      if (!select) return 'no-order-select';
      const next = select.value === 'ORDERED' ? 'PROBLEM' : 'ORDERED';
      select.value = next;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return 'changed:' + next;
    })()`);

    cdp.close();
    return { pages: [inventoryPage, ordersPage], mutations: [inventoryMutation, orderMutation] };
  } catch (err) {
    return { skipped: String(err?.message || err) };
  }
}

function stripBody(row) {
  const { body, ...rest } = row;
  return rest;
}

async function main() {
  await fs.mkdir("/private/tmp/barinv-bench", { recursive: true });
  await ensureFixture();
  await loginHttp();

  // Ensure at least one order exists for order mutation measurement.
  const existingOrder = await prisma.order.findFirst({
    where: { supplierId: "phase2-bench-supplier", status: { not: "CANCELLED" } },
  });
  if (!existingOrder) {
    const item = await prisma.inventoryItem.findFirstOrThrow({ where: { sku: { startsWith: "PHASE2-" }, supplierId: "phase2-bench-supplier" } });
    const user = await prisma.user.findUniqueOrThrow({ where: { username } });
    await prisma.order.create({
      data: {
        supplierId: "phase2-bench-supplier",
        createdById: user.id,
        status: "NEED_TO_ORDER",
        items: {
          create: {
            itemId: item.id,
            suggestedQty: 1,
            orderedQty: 1,
            purchasePriceSnapshot: item.purchasePrice,
            currentQty: item.currentQty,
            minQty: item.minQty,
            reason: "Phase2 benchmark",
            unit: item.unit,
          },
        },
        history: { create: { status: "NEED_TO_ORDER", changedBy: user.id } },
      },
    });
  }

  const output = {
    measuredAt: new Date().toISOString(),
    baseUrl,
    count: await benchmarkCount(),
    salesUnmapped: await benchmarkSalesUnmapped(),
    browser: await benchmarkPagesAndMutations(),
  };
  await fs.writeFile(outFile, JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
