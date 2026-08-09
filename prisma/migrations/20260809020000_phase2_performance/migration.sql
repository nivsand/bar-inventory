-- Phase 2 measured read path:
-- /api/sales/uploads orders by year DESC, weekNumber DESC, uploadedAt DESC.
CREATE INDEX IF NOT EXISTS "SalesUpload_year_weekNumber_uploadedAt_idx"
ON "SalesUpload"("year", "weekNumber", "uploadedAt");
