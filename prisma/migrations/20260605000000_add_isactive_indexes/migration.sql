-- Add isActive indexes for InventoryItem and Category.
-- These tables are always filtered by isActive in every list query.
-- Without indexes, each query does a full table scan.

CREATE INDEX IF NOT EXISTS "InventoryItem_isActive_idx" ON "InventoryItem"("isActive");
CREATE INDEX IF NOT EXISTS "Category_isActive_idx" ON "Category"("isActive");
