import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError } from "@/lib/api";

// List every prep item with its recipe + ingredient lines (for the recipes screen).
export async function GET() {
  try {
    await requireUser();
    const prepItems = await prisma.prepItem.findMany({
      include: {
        item: true,
        recipe: { include: { ingredients: { include: { item: true } } } },
      },
      orderBy: { item: { nameEn: "asc" } },
    });
    return ok(prepItems);
  } catch (e) {
    return serverError(e);
  }
}
