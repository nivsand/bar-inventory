import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestPrep, aggregateIngredientDemand, PrepInput } from "./prep";

const guac: PrepInput = {
  prepItemId: "p1", itemId: "guac", nameHe: "גוואקמולי", nameEn: "Guacamole", unit: "kg",
  currentQty: 1, minQty: 2, parQty: 4, yieldQty: 1,
  ingredients: [
    { itemId: "avocado", nameHe: "אבוקדו", nameEn: "Avocado", qtyPerYield: 0.8, unit: "kg", availableQty: 1 },
    { itemId: "onion", nameHe: "בצל", nameEn: "Onion", qtyPerYield: 0.1, unit: "kg", availableQty: 5 },
  ],
};

test("spec example: produce par - current and flag ingredient shortfall", () => {
  const s = suggestPrep(guac)!;
  assert.equal(s.produceQty, 3); // 4 - 1
  const avo = s.ingredients.find((i) => i.itemId === "avocado")!;
  assert.equal(avo.required, 2.4); // 0.8 * 3 batches
  assert.ok(avo.shortfall > 0, "avocado is short");
  assert.equal(s.ingredientsOk, false);
});

test("no suggestion when prep already at/above par", () => {
  assert.equal(suggestPrep({ ...guac, currentQty: 4 }), null);
  assert.equal(suggestPrep({ ...guac, currentQty: 5 }), null);
});

test("ingredientsOk true when stock sufficient", () => {
  const s = suggestPrep({ ...guac, ingredients: guac.ingredients.map((i) => ({ ...i, availableQty: 999 })) })!;
  assert.equal(s.ingredientsOk, true);
});

test("aggregateIngredientDemand sums required across suggestions", () => {
  const s = suggestPrep(guac)!;
  const demand = aggregateIngredientDemand([s]);
  assert.equal(demand.get("avocado"), 2.4);
  assert.equal(demand.get("onion"), 0.3);
});
