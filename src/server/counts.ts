import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

type CountEntryUpsertInput = {
  countId: string;
  itemId: string;
  countedQty: number;
  previousQty: number | null;
  note?: string | null;
};

/**
 * Preserve DailyCountEntry upsert semantics without one DB round trip per row.
 * Existing rows keep id/createdAt; new rows get explicit ids because Prisma's
 * cuid() default is client-side, not a database default.
 */
export async function upsertDailyCountEntries(
  tx: Prisma.TransactionClient,
  entries: CountEntryUpsertInput[]
) {
  if (entries.length === 0) return 0;

  const byItem = new Map<string, CountEntryUpsertInput>();
  for (const entry of entries) byItem.set(entry.itemId, entry);
  const rows = [...byItem.values()];

  const values = Prisma.join(rows.map((entry) => Prisma.sql`(
    ${randomUUID()},
    ${entry.countId},
    ${entry.itemId},
    CAST(${entry.countedQty} AS double precision),
    ${entry.previousQty == null ? null : entry.previousQty},
    ${entry.note ?? null}
  )`));

  return tx.$executeRaw`
    INSERT INTO "DailyCountEntry" ("id", "countId", "itemId", "countedQty", "previousQty", "note")
    VALUES ${values}
    ON CONFLICT ("countId", "itemId") DO UPDATE
    SET
      "countedQty" = EXCLUDED."countedQty",
      "previousQty" = EXCLUDED."previousQty",
      "note" = EXCLUDED."note"
  `;
}
