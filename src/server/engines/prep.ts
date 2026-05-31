/**
 * Prep Recommendation Engine.
 *
 * For each PREP item below its par level, recommend producing (par - current).
 * Then validate ingredient availability against the recipe. Any ingredient
 * shortfall is surfaced so it can be folded into supplier ordering.
 */

export type PrepInput = {
  prepItemId: string;
  itemId: string;
  nameHe: string; nameEn: string;
  unit: string;
  currentQty: number;
  minQty: number;
  parQty: number;
  yieldQty: number; // recipe produces this many units of the prep item
  ingredients: { itemId: string; nameHe: string; nameEn: string; qtyPerYield: number; unit: string; availableQty: number }[];
};

export type IngredientNeed = {
  itemId: string; nameHe: string; nameEn: string; unit: string;
  required: number; available: number; shortfall: number;
};

export type PrepSuggestion = {
  prepItemId: string;
  itemId: string;
  nameHe: string; nameEn: string;
  unit: string;
  currentQty: number;
  parQty: number;
  produceQty: number;
  ingredients: IngredientNeed[];
  ingredientsOk: boolean;
  reason: string;
};

export function suggestPrep(prep: PrepInput): PrepSuggestion | null {
  if (prep.currentQty >= prep.parQty) return null;
  const produceQty = Math.round((prep.parQty - prep.currentQty) * 100) / 100;
  const batches = prep.yieldQty > 0 ? produceQty / prep.yieldQty : produceQty;

  const ingredients: IngredientNeed[] = prep.ingredients.map((ing) => {
    const required = Math.round(ing.qtyPerYield * batches * 100) / 100;
    const shortfall = Math.max(0, Math.round((required - ing.availableQty) * 100) / 100);
    return {
      itemId: ing.itemId, nameHe: ing.nameHe, nameEn: ing.nameEn, unit: ing.unit,
      required, available: ing.availableQty, shortfall,
    };
  });

  const ingredientsOk = ingredients.every((i) => i.shortfall <= 0);
  return {
    prepItemId: prep.prepItemId,
    itemId: prep.itemId,
    nameHe: prep.nameHe, nameEn: prep.nameEn, unit: prep.unit,
    currentQty: prep.currentQty, parQty: prep.parQty, produceQty,
    ingredients, ingredientsOk,
    reason: `Current ${prep.currentQty} ${prep.unit} below target ${prep.parQty} ${prep.unit}. Produce ${produceQty} ${prep.unit}.`,
  };
}

/** Aggregate all ingredient shortfalls across prep suggestions -> extra demand for ordering. */
export function aggregateIngredientDemand(suggestions: PrepSuggestion[]): Map<string, number> {
  const demand = new Map<string, number>();
  for (const s of suggestions) {
    for (const ing of s.ingredients) {
      demand.set(ing.itemId, (demand.get(ing.itemId) ?? 0) + ing.required);
    }
  }
  return demand;
}
