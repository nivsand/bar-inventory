# Architecture

## Overview
A single Next.js app using the App Router. Server logic lives in API route
handlers (`src/app/api/**`) and a service layer (`src/server/**`); the data model
is Prisma over PostgreSQL. The UI is React client components calling JSON APIs.

```
src/
  app/
    (app)/            # authenticated, wrapped in AppShell (nav + language switch)
      dashboard, count, inventory, suppliers, orders, prep, deliveries, waste, reports, users
    api/              # REST-ish route handlers (21 endpoints)
    login/            # public sign-in
  components/         # AppShell, Providers, shared UI primitives
  lib/                # prisma client, auth, i18n, fetch helper, formatting
  server/             # business logic
    engines/ordering.ts   # smart ordering (pure, unit-testable)
    engines/prep.ts       # prep recommendations + ingredient validation
    ocr/index.ts          # pluggable OCR interface + item matching
    stock.ts              # inventory ledger (single source of mutation)
    audit.ts              # field-level audit logging
prisma/schema.prisma  # normalized schema (20+ models)
scripts/import-excel.ts
```

## Key design decisions

### Inventory ledger (event-sourced stock)
Every change to `InventoryItem.currentQty` goes through `applyAdjustment` /
`setAbsoluteStock`, which write an `InventoryAdjustment` row (delta, result,
source, ref). This gives a complete, auditable stock history and makes
consumption reports trivial.

### Daily count = source of truth
On approval, a count **sets absolute stock** (not a delta), overriding prior
assumptions, and records the difference as a `DAILY_COUNT` adjustment.
Deliveries add deltas; waste subtracts. Approval workflow: DRAFT → SUBMITTED →
APPROVED/REJECTED (or back to DRAFT for recount).

### Smart ordering engine (rule-based)
Pure functions in `engines/ordering.ts`. For each raw item it computes the next
reliable delivery date from the supplier's `deliveryDays` + `leadTimeDays`,
projects stock at that date using `avgDailyUsage`, and if the projection falls
below `minQty` it orders up to `parQty`, rounded to pack/order multiples. It also
folds in **prep ingredient demand** so ordering accounts for planned prep.
Each suggestion carries a human-readable reason.

### Prep engine + ingredient validation
`engines/prep.ts` recommends producing `par − current` for each prep item, then
checks recipe ingredients against live stock. Shortfalls are surfaced and
aggregated into ordering demand. Completing a prep task consumes ingredients and
produces the prep item — all through the ledger.

### Pluggable OCR
`ocr/index.ts` defines `OcrProvider`. The stub returns parseable sample data so
the review UI works offline. Real providers (OpenAI/Google/Azure) implement the
interface and are selected by env var. Extraction never mutates inventory — a
manager reviews and confirms, which then creates a confirmed Delivery.

### i18n / RTL
`I18nProvider` holds locale, flips `<html dir>`, persists to `localStorage` and
the user's DB record. All UI strings come from `lib/i18n/translations.ts`.
Entities carry `nameHe`/`nameEn`; `name(entity)` picks the active one.

### RBAC
`requireUser` / `requireManager` guard every API. The nav and screens hide
manager-only actions. Middleware protects all authenticated routes.

## Future POS integration (architected, not implemented)
`MenuItem` + `MenuRecipe` + `MenuRecipeItem` model what each sold dish consumes.
`SalesImport` is a landing table for POS data. A future job would read sales,
deduct ingredients via the same `applyAdjustment` ledger (source `SALE`), refine
`avgDailyUsage`, and feed demand prediction — no schema changes required.

## Scaling notes
- Indexes on all foreign keys and hot query paths (status, businessDay, ledger).
- Engines are pure & side-effect free → easy to unit test and later move to a job/queue.
- Stateless API + JWT sessions → horizontally scalable.
