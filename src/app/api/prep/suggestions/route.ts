// Always render fresh from the DB — never serve cached/stale data.
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError } from "@/lib/api";

const round = (n: number) => Math.round(n * 1000) / 1000;

// Prep suggestions, computed transparently and directly from the database:
//   available = the linked InventoryItem.currentQty  (NOT par/min/order qty)
//   required  = recipeIngredient.qtyPerYield * (produceQty / recipe yield)
//   shortage  = max(0, required - available)
// Only ACTIVE prep items are returned (archived/duplicate prep items are
// excluded). Ingredients whose linked inventory item is archived/inactive are
// flagged so a wrong/stale recipe link is visible instead of silently using a
// different item's stock.
export async function GET() {
  try {
    await requireUser();

    const prepItems = await prisma.prepItem.findMany({
      where: { item: { isActive: true } },
      include: {
        item: true,
        recipe: {
          include: {
            ingredients: {
              include: {
                item: { select: { id: true, nameHe: true, nameEn: true, currentQty: true, unit: true, isActive: true } },
              },
            },
          },
        },
      },
    });

    const debug = process.env.PREP_DEBUG === "1";

    const suggestions = prepItems
      .map((p) => {
        if (!p.recipe) return null;
        if (p.item.currentQty >= p.item.parQty) return null; // already at/above target

        const produceQty = round(p.item.parQty - p.item.currentQty);
        const yieldQty = p.yieldQty || 1;
        const batches = yieldQty > 0 ? produceQty / yieldQty : produceQty;

        const ingredients = p.recipe.ingredients.map((ri) => {
          const required = round(ri.qtyPerYield * batches);
          const available = ri.item.currentQty; // <-- current stock of the LINKED item
          const shortfall = Math.max(0, round(required - available));
          const row = {
            recipeIngredientId: ri.id,
            itemId: ri.itemId,
            nameHe: ri.item.nameHe,
            nameEn: ri.item.nameEn,
            unit: ri.unit,
            itemUnit: ri.item.unit,
            required,
            available,
            shortfall,
            inactive: !ri.item.isActive, // recipe points at an archived/deleted item
          };
          if (debug) {
            console.log("[PREP_DEBUG]", p.item.nameEn, {
              recipeIngredientId: ri.id,
              linkedItemId: ri.itemId,
              itemName: ri.item.nameEn,
              currentQty: ri.item.currentQty,
              itemUnit: ri.item.unit,
              recipeUnit: ri.unit,
              required,
              available,
              shortfall,
              itemActive: ri.item.isActive,
            });
          }
          return row;
        });

        return {
          prepItemId: p.id,
          itemId: p.itemId,
          nameHe: p.item.nameHe,
          nameEn: p.item.nameEn,
          unit: p.item.unit,
          currentQty: p.item.currentQty,
          parQty: p.item.parQty,
          produceQty,
          ingredients,
          ingredientsOk: ingredients.every((i) => i.shortfall <= 0),
          hasInactiveIngredient: ingredients.some((i) => i.inactive),
        };
      })
      .filter(Boolean);

    return ok(suggestions);
  } catch (e) {
    return serverError(e);
  }
}
