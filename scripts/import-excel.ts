/**
 * Excel importer — converts existing inventory & supplier spreadsheets into DB records.
 *
 * Usage:  npm run import:excel -- ./path/to/inventory.xlsx
 *
 * Expected (flexible) columns. Header names are matched case-insensitively and support
 * Hebrew or English. Map your own columns in COLUMN_ALIASES below — nothing is hard-coded
 * to a specific file; this simply translates whatever structure your Excel uses.
 *
 *   Suppliers sheet : name_he | name_en | contact | phone | whatsapp | email | method |
 *                     deadline_days | cutoff | delivery_days | min_order | notes
 *   Inventory sheet : name_he | name_en | category | supplier | unit | current | min |
 *                     par | avg_daily_usage | kind | notes
 *
 * Run with no real DB to do a DRY RUN (prints parsed rows): set DRY_RUN=1.
 */
import * as XLSX from "xlsx";
import { PrismaClient, ItemKind, OrderingMethod } from "@prisma/client";

const prisma = new PrismaClient();

const COLUMN_ALIASES: Record<string, string[]> = {
  name_he: ["name_he", "שם", "שם עברית", "מוצר", "פריט"],
  name_en: ["name_en", "name", "english", "שם אנגלית"],
  category: ["category", "קטגוריה", "קבוצה"],
  supplier: ["supplier", "ספק"],
  unit: ["unit", "יחידה", "יח'"],
  current: ["current", "currentqty", "qty", "כמות", "מלאי"],
  min: ["min", "minqty", "minimum", "מינימום"],
  par: ["par", "parqty", "target", "יעד"],
  avg_daily_usage: ["avg_daily_usage", "usage", "consumption", "צריכה"],
  kind: ["kind", "type", "סוג"],
  notes: ["notes", "note", "הערות"],
  contact: ["contact", "contactperson", "איש קשר"],
  phone: ["phone", "טלפון"],
  whatsapp: ["whatsapp", "וואטסאפ"],
  email: ["email", "אימייל", "דוא\"ל"],
  method: ["method", "orderingmethod", "שיטת הזמנה"],
};

function pick(row: Record<string, any>, key: string): any {
  const aliases = COLUMN_ALIASES[key] ?? [key];
  for (const k of Object.keys(row)) {
    const norm = k.trim().toLowerCase();
    if (aliases.some((a) => a.toLowerCase() === norm)) return row[k];
  }
  return undefined;
}

const num = (v: any, d = 0) => (v == null || v === "" ? d : Number(String(v).replace(/[^\d.\-]/g, "")) || d);

async function main() {
  const file = process.argv[2];
  if (!file) { console.error("Usage: npm run import:excel -- <file.xlsx>"); process.exit(1); }
  const dry = process.env.DRY_RUN === "1";
  const wb = XLSX.readFile(file);

  // Suppliers
  const supSheet = wb.SheetNames.find((n) => /sup|ספק/i.test(n));
  const supplierMap = new Map<string, string>();
  if (supSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[supSheet]);
    for (const r of rows) {
      const nameEn = pick(r, "name_en") || pick(r, "name_he");
      if (!nameEn) continue;
      const data = {
        nameHe: String(pick(r, "name_he") || nameEn),
        nameEn: String(nameEn),
        contactPerson: pick(r, "contact") ? String(pick(r, "contact")) : null,
        phone: pick(r, "phone") ? String(pick(r, "phone")) : null,
        whatsapp: pick(r, "whatsapp") ? String(pick(r, "whatsapp")) : null,
        email: pick(r, "email") ? String(pick(r, "email")) : null,
        orderingMethod: (String(pick(r, "method") || "WHATSAPP").toUpperCase() as OrderingMethod) || OrderingMethod.WHATSAPP,
        notes: pick(r, "notes") ? String(pick(r, "notes")) : null,
      };
      if (dry) { console.log("SUPPLIER", data); continue; }
      const s = await prisma.supplier.create({ data });
      supplierMap.set(data.nameEn.toLowerCase(), s.id);
      supplierMap.set(data.nameHe.toLowerCase(), s.id);
    }
  }

  // Inventory
  const invSheet = wb.SheetNames.find((n) => /inv|item|מלאי|פריט/i.test(n)) ?? wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[invSheet]);
  const catMap = new Map<string, string>();
  for (const r of rows) {
    const nameEn = pick(r, "name_en") || pick(r, "name_he");
    if (!nameEn) continue;
    const catName = String(pick(r, "category") || "Uncategorized");
    const kind = /prep|הכנה/i.test(String(pick(r, "kind") || "")) ? ItemKind.PREP : ItemKind.RAW;
    let categoryId: string | null = null;
    if (!dry) {
      let cid = catMap.get(catName.toLowerCase());
      if (!cid) {
        const c = await prisma.category.create({ data: { nameHe: catName, nameEn: catName, kind } });
        cid = c.id; catMap.set(catName.toLowerCase(), cid);
      }
      categoryId = cid;
    }
    const supName = String(pick(r, "supplier") || "").toLowerCase();
    const supplierId = supplierMap.get(supName) ?? null;
    const data = {
      nameHe: String(pick(r, "name_he") || nameEn),
      nameEn: String(nameEn),
      unit: String(pick(r, "unit") || "unit"),
      kind, categoryId, supplierId,
      currentQty: num(pick(r, "current")),
      minQty: num(pick(r, "min")),
      parQty: num(pick(r, "par")),
      avgDailyUsage: num(pick(r, "avg_daily_usage")),
      notes: pick(r, "notes") ? String(pick(r, "notes")) : null,
    };
    if (dry) { console.log("ITEM", data); continue; }
    await prisma.inventoryItem.create({ data });
  }
  console.log(dry ? "Dry run complete." : "Import complete.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
