/**
 * Pluggable OCR / document-extraction interface.
 *
 * The MVP ships a deterministic STUB provider so the receipt-review flow works
 * end-to-end with zero external dependencies. To wire a real provider (OpenAI
 * vision, Google Document AI, Azure, etc.), implement OcrProvider and select it
 * via the OCR_PROVIDER env var. Inventory is NEVER updated automatically — the
 * extracted result is returned for manager review and approval.
 */

export type ExtractedItem = {
  rawName: string;
  quantity: number | null;
  unit: string | null;
};

export type ExtractedReceipt = {
  supplierGuess: string | null;
  date: string | null;
  items: ExtractedItem[];
  rawText: string;
  confidence: number;
};

export interface OcrProvider {
  name: string;
  extract(input: { buffer: Buffer; mimeType: string; filename: string }): Promise<ExtractedReceipt>;
}

/** Deterministic stub: returns a parseable sample so the review UI is testable. */
class StubOcrProvider implements OcrProvider {
  name = "stub";
  async extract(input: { buffer: Buffer; mimeType: string; filename: string }): Promise<ExtractedReceipt> {
    return {
      supplierGuess: null,
      date: new Date().toISOString().slice(0, 10),
      items: [
        { rawName: "Avocado", quantity: 10, unit: "kg" },
        { rawName: "Onion", quantity: 5, unit: "kg" },
        { rawName: "Tomato", quantity: 8, unit: "kg" },
      ],
      rawText:
        `[STUB OCR for ${input.filename}] Configure OCR_PROVIDER + OCR_API_KEY to enable real extraction.`,
      confidence: 0,
    };
  }
}

// Real providers can be added here, e.g.:
// class OpenAiOcrProvider implements OcrProvider { ... }

export function getOcrProvider(): OcrProvider {
  const provider = process.env.OCR_PROVIDER;
  switch (provider) {
    // case "openai": return new OpenAiOcrProvider(process.env.OCR_API_KEY!);
    default:
      return new StubOcrProvider();
  }
}

/**
 * Fuzzy-match an extracted raw name to a known inventory item.
 * Returns the best candidate id or null. Pure function -> easy to unit test.
 */
export function matchItem(
  rawName: string,
  items: { id: string; nameHe: string; nameEn: string }[]
): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9֐-׿]/g, "");
  const target = norm(rawName);
  if (!target) return null;
  let best: { id: string; score: number } | null = null;
  for (const it of items) {
    for (const cand of [it.nameEn, it.nameHe]) {
      const c = norm(cand);
      if (!c) continue;
      let score = 0;
      if (c === target) score = 100;
      else if (c.includes(target) || target.includes(c)) score = 70;
      else {
        // token overlap
        const a = new Set(target.match(/.{1,3}/g) ?? []);
        const b = new Set(c.match(/.{1,3}/g) ?? []);
        const inter = [...a].filter((x) => b.has(x)).length;
        score = (inter / Math.max(a.size, 1)) * 50;
      }
      if (!best || score > best.score) best = { id: it.id, score };
    }
  }
  return best && best.score >= 40 ? best.id : null;
}
