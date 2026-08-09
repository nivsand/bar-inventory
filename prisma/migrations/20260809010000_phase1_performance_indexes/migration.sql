-- Safe composite indexes for measured Phase 1 hot read patterns.

CREATE INDEX IF NOT EXISTS "InventoryItem_isActive_kind_idx" ON "InventoryItem"("isActive", "kind");
CREATE INDEX IF NOT EXISTS "InventoryItem_isActive_area_kind_nameEn_idx" ON "InventoryItem"("isActive", "area", "kind", "nameEn");
CREATE INDEX IF NOT EXISTS "InventoryItem_isActive_area_inCount_kind_nameEn_idx" ON "InventoryItem"("isActive", "area", "inCount", "kind", "nameEn");

CREATE INDEX IF NOT EXISTS "Supplier_isActive_nameEn_idx" ON "Supplier"("isActive", "nameEn");

CREATE INDEX IF NOT EXISTS "Order_createdAt_idx" ON "Order"("createdAt");

CREATE INDEX IF NOT EXISTS "AuditLog_entity_createdAt_idx" ON "AuditLog"("entity", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
