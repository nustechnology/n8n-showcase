-- AlterTable
ALTER TABLE "orders" ADD COLUMN "tracking_number" TEXT,
ADD COLUMN "carrier" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "orders_tracking_number_key" ON "orders"("tracking_number");
