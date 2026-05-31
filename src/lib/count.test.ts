import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQty, sanitizeCountEntries } from "./count";

test("parseQty accepts plain numbers", () => {
  assert.equal(parseQty("3"), 3);
  assert.equal(parseQty("2.5"), 2.5);
  assert.equal(parseQty(0), 0);
});

test("parseQty handles locale decimal comma (the submission-bug case)", () => {
  assert.equal(parseQty("3,5"), 3.5);
});

test("parseQty strips trailing unit text", () => {
  assert.equal(parseQty("3 kg"), 3);
});

test("parseQty rejects junk and negatives -> null (never NaN)", () => {
  assert.equal(parseQty(""), null);
  assert.equal(parseQty("   "), null);
  assert.equal(parseQty("abc"), null);
  assert.equal(parseQty("-2"), null);
  assert.equal(parseQty("."), null);
  assert.equal(parseQty(NaN), null);
});

test("sanitizeCountEntries drops blanks/invalid and keeps valid", () => {
  const out = sanitizeCountEntries({ a: "3", b: "", c: "abc", d: "1,5", e: "-1" });
  assert.deepEqual(out.sort((x, y) => x.itemId.localeCompare(y.itemId)), [
    { itemId: "a", countedQty: 3 },
    { itemId: "d", countedQty: 1.5 },
  ]);
});
