-- CreateEnum
CREATE TYPE "Area" AS ENUM ('KITCHEN', 'FLOOR');

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "area" "Area" NOT NULL DEFAULT 'KITCHEN',
ADD COLUMN     "inCount" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "orderUnitNameEn" TEXT,
ADD COLUMN     "orderUnitNameHe" TEXT,
ADD COLUMN     "unitsPerOrderUnit" DOUBLE PRECISION;
