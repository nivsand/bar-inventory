import fs from "node:fs/promises";

const baseUrl = process.env.BENCH_BASE_URL || "http://localhost:3002";
const cdpBase = process.env.CDP_BASE || "http://127.0.0.1:9223";
const outFile = process.env.PAGE_BENCH_OUT || "/private/tmp/barinv-bench/page-results.json";
const username = process.env.BENCH_USER || "admin@bar.local";
const password = process.env.BENCH_PASSWORD || "password123";

const pages = [
  "/dashboard",
  "/inventory",
  "/count",
  "/prep",
  "/orders",
  "/deliveries",
  "/suppliers",
  "/reports",
  "/recipes",
  "/categories",
  "/locations",
  "/users",
  "/waste",
  "/audit",
];

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
  once(method) {
    return new Promise((resolve) => {
      const fn = (params) => {
        const list = this.listeners.get(method) || [];
        this.listeners.set(method, list.filter((x) => x !== fn));
        resolve(params);
      };
      this.on(method, fn);
    });
  }
  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  close() {
    this.ws.close();
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  await cdp.send("Page.setLifecycleEventsEnabled", { enabled: true });
  return cdp;
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

async function login(cdp) {
  await cdp.send("Page.navigate", { url: `${baseUrl}/login` });
  await cdp.once("Page.loadEventFired");
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
    return { status: res.status, session };
  })()`);
  if (result.status !== 200 || !result.session?.user) throw new Error(`Browser login failed: ${JSON.stringify(result)}`);
}

async function measurePage(cdp, path) {
  const requests = new Map();
  const inflight = new Set();
  let lastNetworkChange = Date.now();
  const addListener = (method, fn) => cdp.on(method, fn);
  addListener("Network.requestWillBeSent", (p) => {
    if (!p.request?.url) return;
    inflight.add(p.requestId);
    lastNetworkChange = Date.now();
    requests.set(p.requestId, {
      id: p.requestId,
      url: p.request.url,
      method: p.request.method,
      type: p.type,
      startTs: p.timestamp,
      status: null,
      mimeType: null,
      encodedBytes: 0,
      endTs: null,
    });
  });
  addListener("Network.responseReceived", (p) => {
    const r = requests.get(p.requestId);
    if (!r) return;
    r.status = p.response.status;
    r.mimeType = p.response.mimeType;
    r.responseTs = p.timestamp;
  });
  addListener("Network.loadingFinished", (p) => {
    const r = requests.get(p.requestId);
    if (r) {
      r.encodedBytes = p.encodedDataLength || 0;
      r.endTs = p.timestamp;
    }
    inflight.delete(p.requestId);
    lastNetworkChange = Date.now();
  });
  addListener("Network.loadingFailed", (p) => {
    const r = requests.get(p.requestId);
    if (r) {
      r.failed = true;
      r.endTs = p.timestamp;
    }
    inflight.delete(p.requestId);
    lastNetworkChange = Date.now();
  });

  const started = Date.now();
  const loadPromise = cdp.once("Page.loadEventFired");
  await cdp.send("Page.navigate", { url: `${baseUrl}${path}` });
  await Promise.race([loadPromise, sleep(10000)]);
  while (Date.now() - started < 15000) {
    if (inflight.size === 0 && Date.now() - lastNetworkChange > 900) break;
    await sleep(100);
  }
  await sleep(500);

  const client = await evalValue(cdp, `(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const renders = window.__REACT_RENDER_EVENTS__ || [];
    return {
      title: document.title,
      url: location.href,
      nav: nav ? {
        duration: nav.duration,
        domContentLoaded: nav.domContentLoadedEventEnd,
        loadEventEnd: nav.loadEventEnd,
        transferSize: nav.transferSize,
        encodedBodySize: nav.encodedBodySize,
        decodedBodySize: nav.decodedBodySize,
      } : null,
      renders,
    };
  })()`);
  const reqs = [...requests.values()].filter((r) => r.url.startsWith(baseUrl) || r.url.includes("/_next/"));
  const api = reqs.filter((r) => new URL(r.url).pathname.startsWith("/api/"));
  const chunks = reqs.filter((r) => r.url.includes("/_next/static/chunks/"));
  const renderActualTotal = client.renders.reduce((sum, r) => sum + r.actualDuration, 0);
  const renderActualMax = client.renders.reduce((max, r) => Math.max(max, r.actualDuration), 0);

  return {
    path,
    navDurationMs: Math.round((client.nav?.duration || 0) * 10) / 10,
    domContentLoadedMs: Math.round((client.nav?.domContentLoaded || 0) * 10) / 10,
    loadEventEndMs: Math.round((client.nav?.loadEventEnd || 0) * 10) / 10,
    requestCount: reqs.length,
    apiRequestCount: api.length,
    apiEncodedBytes: api.reduce((sum, r) => sum + (r.encodedBytes || 0), 0),
    totalEncodedBytes: reqs.reduce((sum, r) => sum + (r.encodedBytes || 0), 0),
    chunkCount: chunks.length,
    chunkEncodedBytes: chunks.reduce((sum, r) => sum + (r.encodedBytes || 0), 0),
    reactCommitCount: client.renders.length,
    reactActualTotalMs: Math.round(renderActualTotal * 10) / 10,
    reactActualMaxMs: Math.round(renderActualMax * 10) / 10,
    apiRequests: api.map((r) => ({
      path: new URL(r.url).pathname + new URL(r.url).search,
      status: r.status,
      encodedBytes: r.encodedBytes || 0,
      durationMs: r.endTs && r.startTs ? Math.round((r.endTs - r.startTs) * 1000 * 10) / 10 : null,
    })),
    largestChunks: chunks
      .map((r) => ({ path: new URL(r.url).pathname, encodedBytes: r.encodedBytes || 0 }))
      .sort((a, b) => b.encodedBytes - a.encodedBytes)
      .slice(0, 8),
  };
}

async function main() {
  if (typeof WebSocket !== "function") throw new Error("Node runtime has no global WebSocket");
  await fs.mkdir("/private/tmp/barinv-bench", { recursive: true });
  const cdp = await newPage();
  await login(cdp);

  for (const path of pages) {
    await measurePage(cdp, path);
  }

  const measured = [];
  for (const path of pages) {
    measured.push(await measurePage(cdp, path));
  }
  cdp.close();

  const output = {
    measuredAt: new Date().toISOString(),
    baseUrl,
    note: "Headless Chrome, dev server, second pass after route warm-up.",
    pages: measured,
  };
  await fs.writeFile(outFile, JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
