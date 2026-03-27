-- CreateEnum
CREATE TYPE "TradeSource" AS ENUM ('AUTO', 'MANUAL');

-- AlterTable Trade
ALTER TABLE "Trade" ADD COLUMN "tradeSource" "TradeSource" NOT NULL DEFAULT 'AUTO';

-- AlterTable Position
ALTER TABLE "Position" ADD COLUMN "tradeSource" "TradeSource" NOT NULL DEFAULT 'AUTO';

-- CreateIndex
CREATE INDEX "Trade_tradeSource_executedAt_idx" ON "Trade"("tradeSource", "executedAt");

-- CreateIndex
CREATE INDEX "Position_tradeSource_status_idx" ON "Position"("tradeSource", "status");
