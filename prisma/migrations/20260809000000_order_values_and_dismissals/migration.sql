-- Add purchase prices for item-level order valuation.
ALTER TABLE "InventoryItem" ADD COLUMN "purchasePrice" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN "purchasePriceSnapshot" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Persist manager decisions to hide a supplier recommendation for a single day.
CREATE TABLE "OrderRecommendationDismissal" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "recommendationDate" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderRecommendationDismissal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderRecommendationDismissal_supplierId_recommendationDate_key" ON "OrderRecommendationDismissal"("supplierId", "recommendationDate");
CREATE INDEX "OrderRecommendationDismissal_recommendationDate_idx" ON "OrderRecommendationDismissal"("recommendationDate");
CREATE INDEX "OrderRecommendationDismissal_createdById_idx" ON "OrderRecommendationDismissal"("createdById");

ALTER TABLE "OrderRecommendationDismissal" ADD CONSTRAINT "OrderRecommendationDismissal_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderRecommendationDismissal" ADD CONSTRAINT "OrderRecommendationDismissal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
