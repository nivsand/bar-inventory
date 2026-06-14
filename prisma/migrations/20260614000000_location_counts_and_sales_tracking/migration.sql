-- CreateEnum
CREATE TYPE "SalesUploadSource" AS ENUM ('CSV', 'EXCEL', 'PASTE');

-- CreateEnum
CREATE TYPE "SalesUploadStatus" AS ENUM ('PENDING_MAPPING', 'PROCESSED');

-- AlterTable
ALTER TABLE "DailyCount" ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "locationId" TEXT;

-- DropTable
DROP TABLE "SalesImport";

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "nameHe" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesUpload" (
    "id" TEXT NOT NULL,
    "source" "SalesUploadSource" NOT NULL,
    "fileName" TEXT,
    "rawData" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "SalesUploadStatus" NOT NULL DEFAULT 'PENDING_MAPPING',
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "SalesUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesLine" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "posProductName" TEXT NOT NULL,
    "quantitySold" DOUBLE PRECISION NOT NULL,
    "revenue" DOUBLE PRECISION,
    "mappedItemId" TEXT,

    CONSTRAINT "SalesLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductMapping" (
    "id" TEXT NOT NULL,
    "posProductName" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklySales" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "quantitySold" DOUBLE PRECISION NOT NULL,
    "revenue" DOUBLE PRECISION,

    CONSTRAINT "WeeklySales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Location_nameEn_key" ON "Location"("nameEn");

-- CreateIndex
CREATE INDEX "Location_isActive_idx" ON "Location"("isActive");

-- CreateIndex
CREATE INDEX "SalesUpload_year_weekNumber_idx" ON "SalesUpload"("year", "weekNumber");

-- CreateIndex
CREATE INDEX "SalesLine_uploadId_idx" ON "SalesLine"("uploadId");

-- CreateIndex
CREATE INDEX "SalesLine_mappedItemId_idx" ON "SalesLine"("mappedItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductMapping_posProductName_key" ON "ProductMapping"("posProductName");

-- CreateIndex
CREATE INDEX "ProductMapping_itemId_idx" ON "ProductMapping"("itemId");

-- CreateIndex
CREATE INDEX "WeeklySales_year_weekNumber_idx" ON "WeeklySales"("year", "weekNumber");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklySales_itemId_year_weekNumber_key" ON "WeeklySales"("itemId", "year", "weekNumber");

-- CreateIndex
CREATE INDEX "DailyCount_locationId_idx" ON "DailyCount"("locationId");

-- CreateIndex
CREATE INDEX "InventoryItem_locationId_idx" ON "InventoryItem"("locationId");

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCount" ADD CONSTRAINT "DailyCount_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesUpload" ADD CONSTRAINT "SalesUpload_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesLine" ADD CONSTRAINT "SalesLine_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "SalesUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesLine" ADD CONSTRAINT "SalesLine_mappedItemId_fkey" FOREIGN KEY ("mappedItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMapping" ADD CONSTRAINT "ProductMapping_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklySales" ADD CONSTRAINT "WeeklySales_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
