import { z } from "zod";

const nullableString = z.string().nullable().optional();
const nullableNumber = z.coerce.number().nullable().optional();

export const inventoryCreateSchema = z.object({
  nameHe: z.string().min(1),
  nameEn: z.string().min(1),
  unit: z.string().min(1),
  kind: z.enum(["RAW", "PREP"]).default("RAW"),
  area: z.enum(["KITCHEN", "FLOOR"]).default("KITCHEN"),
  inCount: z.boolean().default(true),
  categoryId: nullableString,
  supplierId: nullableString,
  locationId: nullableString,
  currentQty: z.coerce.number().default(0),
  minQty: z.coerce.number().default(0),
  parQty: z.coerce.number().default(0),
  purchasePrice: z.coerce.number().min(0).default(0),
  avgDailyUsage: z.coerce.number().default(0),
  packSize: nullableNumber,
  orderMultiple: nullableNumber,
  shelfLifeDays: nullableNumber,
  orderUnitNameHe: nullableString,
  orderUnitNameEn: nullableString,
  unitsPerOrderUnit: nullableNumber,
  messageUnitHe: nullableString,
  messageUnitEn: nullableString,
  showBaseQuantityInMessage: z.boolean().default(false),
  notes: nullableString,
});

export const inventoryPatchSchema = inventoryCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
}).strip();

export const countSubmitSchema = z.object({
  entries: z.array(
    z.object({
      itemId: z.string().min(1),
      countedQty: z.number().finite().nonnegative(),
      note: nullableString,
    })
  ),
  notes: nullableString,
});
