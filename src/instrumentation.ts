/**
 * Next.js instrumentation hook — runs once per server process, before any
 * request is handled.
 *
 * Registers OpenTelemetry so Vercel Observability receives traces/spans for
 * server-rendered pages and API routes. On Vercel this is picked up
 * automatically; locally it is a no-op unless an OTLP exporter is configured.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerOTel } = await import("@vercel/otel");
    registerOTel({ serviceName: "bar-inventory" });
  }
}
