/**
 * Seed script — realistic starter data for a Mexican-style bar/restaurant.
 * Everything here is editable through the UI; nothing is hard-coded in app logic.
 * Run: npm run db:seed
 */
import { PrismaClient, Role, ItemKind, OrderingMethod } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // --- Users ---
  const pwd = await bcrypt.hash("password123", 10);
  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: { username: "admin", email: "admin@bar.local", name: "Admin", role: Role.ADMIN, passwordHash: pwd, locale: "he" },
  });
  const manager = await prisma.user.upsert({
    where: { username: "manager" },
    update: {},
    create: { username: "manager", email: "manager@bar.local", name: "Manager", role: Role.MANAGER, passwordHash: pwd, locale: "he" },
  });
  await prisma.user.upsert({
    where: { username: "employee" },
    update: {},
    create: { username: "employee", email: "employee@bar.local", name: "Employee", role: Role.EMPLOYEE, passwordHash: pwd, locale: "he" },
  });

  // --- Categories ---
  const cat = async (nameHe: string, nameEn: string, kind: ItemKind, sortOrder: number) =>
    prisma.category.create({ data: { nameHe, nameEn, kind, sortOrder } });

  const cVeg = await cat("ירקות", "Vegetables", ItemKind.RAW, 1);
  const cDairy = await cat("מוצרי חלב", "Dairy", ItemKind.RAW, 2);
  const cMeat = await cat("בשר", "Meat", ItemKind.RAW, 3);
  const cDry = await cat("יבשים", "Dry Goods", ItemKind.RAW, 4);
  const cPrep = await cat("הכנות", "Prepared", ItemKind.PREP, 5);

  // --- Suppliers ---
  const supVeg = await prisma.supplier.create({
    data: {
      nameHe: "ירקות השדה", nameEn: "Field Vegetables", contactPerson: "Yossi",
      phone: "+972500000001", whatsapp: "+972500000001", email: "orders@fieldveg.local",
      orderingMethod: OrderingMethod.WHATSAPP, orderDeadlineDays: [0, 2, 4], orderCutoffTime: "20:00",
      deliveryDays: [1, 3, 5], leadTimeDays: 1, minOrderAmount: 200, minOrderNote: "Min 200 ILS",
      notes: "Delivers Mon/Wed/Fri mornings",
    },
  });
  const supDairy = await prisma.supplier.create({
    data: {
      nameHe: "מחלבות הגליל", nameEn: "Galilee Dairy", contactPerson: "Rina",
      phone: "+972500000002", whatsapp: "+972500000002", email: "sales@galileedairy.local",
      orderingMethod: OrderingMethod.EMAIL, orderDeadlineDays: [1, 4], orderCutoffTime: "16:00",
      deliveryDays: [2, 5], leadTimeDays: 1, notes: "",
    },
  });
  const supMeat = await prisma.supplier.create({
    data: {
      nameHe: "אטליז המרכז", nameEn: "Central Butchery", contactPerson: "Avi",
      phone: "+972500000003", whatsapp: "+972500000003", email: "avi@centralmeat.local",
      orderingMethod: OrderingMethod.PHONE, orderDeadlineDays: [0, 3], orderCutoffTime: "12:00",
      deliveryDays: [1, 4], leadTimeDays: 2, minOrderAmount: 500, minOrderNote: "Min 500 ILS",
    },
  });

  // --- Raw items ---
  const raw = async (
    nameHe: string, nameEn: string, unit: string, supplierId: string, categoryId: string,
    currentQty: number, minQty: number, parQty: number, avgDailyUsage: number, extra: any = {}
  ) =>
    prisma.inventoryItem.create({
      data: { nameHe, nameEn, unit, supplierId, categoryId, kind: ItemKind.RAW,
        currentQty, minQty, parQty, avgDailyUsage, ...extra },
    });

  const avocado = await raw("אבוקדו", "Avocado", "kg", supVeg.id, cVeg.id, 2, 5, 15, 3, { packSize: 10, orderMultiple: 1 });
  const onion = await raw("בצל", "Onion", "kg", supVeg.id, cVeg.id, 8, 5, 20, 2);
  const tomato = await raw("עגבנייה", "Tomato", "kg", supVeg.id, cVeg.id, 6, 5, 18, 4);
  const cilantro = await raw("כוסברה", "Cilantro", "bunch", supVeg.id, cVeg.id, 4, 6, 20, 5);
  const lime = await raw("ליים", "Lime", "kg", supVeg.id, cVeg.id, 3, 3, 10, 1.5);
  const jalapeno = await raw("חלפיניו", "Jalapeño", "kg", supVeg.id, cVeg.id, 1, 2, 6, 0.8);
  const cheese = await raw("גבינה צהובה", "Cheese", "kg", supDairy.id, cDairy.id, 4, 4, 12, 2);
  const sourCream = await raw("שמנת חמוצה", "Sour Cream", "kg", supDairy.id, cDairy.id, 3, 3, 8, 1.2);
  const beef = await raw("בשר טחון", "Ground Beef", "kg", supMeat.id, cMeat.id, 5, 6, 20, 4);
  const chicken = await raw("חזה עוף", "Chicken Breast", "kg", supMeat.id, cMeat.id, 7, 6, 18, 3);
  const tortilla = await raw("טורטייה", "Tortilla", "unit", supVeg.id, cDry.id, 120, 100, 400, 60, { packSize: 50, orderMultiple: 50 });
  const buns = await raw("לחמניות", "Burger Buns", "unit", supVeg.id, cDry.id, 40, 50, 200, 30, { packSize: 24, orderMultiple: 24 });

  // --- Prep items (each is an InventoryItem of kind PREP + PrepItem + Recipe) ---
  const makePrep = async (
    nameHe: string, nameEn: string, unit: string, currentQty: number, minQty: number,
    parQty: number, avgDailyUsage: number, yieldQty: number, shelfLifeDays: number,
    ingredients: { itemId: string; qtyPerYield: number; unit: string }[]
  ) => {
    const item = await prisma.inventoryItem.create({
      data: { nameHe, nameEn, unit, kind: ItemKind.PREP, categoryId: cPrep.id,
        currentQty, minQty, parQty, avgDailyUsage, shelfLifeDays },
    });
    const prep = await prisma.prepItem.create({
      data: { itemId: item.id, yieldQty, shelfLifeDays, instructions: "" },
    });
    const recipe = await prisma.recipe.create({
      data: { prepItemId: prep.id, nameHe, nameEn },
    });
    for (const ing of ingredients) {
      await prisma.recipeIngredient.create({ data: { recipeId: recipe.id, ...ing } });
    }
    return item;
  };

  const guac = await makePrep("גוואקמולי", "Guacamole", "kg", 1, 2, 4, 1.5, 1, 2, [
    { itemId: avocado.id, qtyPerYield: 0.8, unit: "kg" },
    { itemId: onion.id, qtyPerYield: 0.1, unit: "kg" },
    { itemId: cilantro.id, qtyPerYield: 0.5, unit: "bunch" },
    { itemId: lime.id, qtyPerYield: 0.1, unit: "kg" },
  ]);
  const pico = await makePrep("פיקו דה גאיו", "Pico de Gallo", "kg", 0.5, 1, 3, 1, 1, 2, [
    { itemId: tomato.id, qtyPerYield: 0.6, unit: "kg" },
    { itemId: onion.id, qtyPerYield: 0.2, unit: "kg" },
    { itemId: cilantro.id, qtyPerYield: 0.4, unit: "bunch" },
    { itemId: jalapeno.id, qtyPerYield: 0.05, unit: "kg" },
  ]);
  const chimi = await makePrep("צ'ימיצ'ורי", "Chimichurri", "kg", 0.8, 1, 2.5, 0.7, 1, 3, [
    { itemId: cilantro.id, qtyPerYield: 0.6, unit: "bunch" },
    { itemId: onion.id, qtyPerYield: 0.1, unit: "kg" },
    { itemId: lime.id, qtyPerYield: 0.08, unit: "kg" },
  ]);

  // --- Menu items (for future POS integration) ---
  const burger = await prisma.menuItem.create({ data: { nameHe: "המבורגר", nameEn: "Burger", price: 62 } });
  const burgerR = await prisma.menuRecipe.create({ data: { menuItemId: burger.id } });
  await prisma.menuRecipeItem.createMany({
    data: [
      { menuRecipeId: burgerR.id, itemId: buns.id, qtyPerUnit: 1, unit: "unit" },
      { menuRecipeId: burgerR.id, itemId: beef.id, qtyPerUnit: 0.18, unit: "kg" },
      { menuRecipeId: burgerR.id, itemId: tomato.id, qtyPerUnit: 0.05, unit: "kg" },
      { menuRecipeId: burgerR.id, itemId: guac.id, qtyPerUnit: 0.05, unit: "kg" },
    ],
  });
  const taco = await prisma.menuItem.create({ data: { nameHe: "טאקו", nameEn: "Taco", price: 48 } });
  const tacoR = await prisma.menuRecipe.create({ data: { menuItemId: taco.id } });
  await prisma.menuRecipeItem.createMany({
    data: [
      { menuRecipeId: tacoR.id, itemId: tortilla.id, qtyPerUnit: 2, unit: "unit" },
      { menuRecipeId: tacoR.id, itemId: chicken.id, qtyPerUnit: 0.12, unit: "kg" },
      { menuRecipeId: tacoR.id, itemId: pico.id, qtyPerUnit: 0.04, unit: "kg" },
    ],
  });

  // --- Locations (Phase 1: location-based counts) ---
  const locations: [string, string, number][] = [
    ["מקפיא", "Freezer", 1],
    ["מקרר", "Refrigerator", 2],
    ["בר", "Bar", 3],
    ["מטבח", "Kitchen", 4],
    ["מחסן יבש", "Dry Storage", 5],
    ["מחסן חומרי ניקיון", "Cleaning Supplies Storage", 6],
  ];
  for (const [nameHe, nameEn, sortOrder] of locations) {
    await prisma.location.upsert({
      where: { nameEn }, update: {}, create: { nameHe, nameEn, sortOrder },
    });
  }

  // --- Settings ---
  await prisma.setting.upsert({
    where: { key: "defaultLocale" }, update: {}, create: { key: "defaultLocale", value: "he" },
  });
  await prisma.setting.upsert({
    where: { key: "businessName" }, update: {}, create: { key: "businessName", value: "El Bar" },
  });

  console.log("Seed complete. Logins: admin / manager / employee (password: password123)");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
