import { NextResponse } from "next/server";

export function ok(data: any, init?: ResponseInit) { return NextResponse.json(data, init); }
export function created(data: any) { return NextResponse.json(data, { status: 201 }); }
export function badRequest(msg: string) { return NextResponse.json({ error: msg }, { status: 400 }); }
export function unauthorized() { return NextResponse.json({ error: "Unauthenticated" }, { status: 401 }); }
export function forbidden() { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }
export function notFound() { return NextResponse.json({ error: "Not found" }, { status: 404 }); }
export function serverError(e: unknown) {
  const msg = e instanceof Error ? e.message : "Server error";
  if (msg === "UNAUTHENTICATED") return unauthorized();
  if (msg === "FORBIDDEN") return forbidden();
  console.error(e);
  return NextResponse.json({ error: msg }, { status: 500 });
}
