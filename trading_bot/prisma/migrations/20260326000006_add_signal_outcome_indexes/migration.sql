-- CreateIndex
CREATE INDEX CONCURRENTLY "Signal_detectedAt_priceAfter5m_idx" ON "Signal"("detectedAt", "priceAfter5m");

-- CreateIndex
CREATE INDEX CONCURRENTLY "Signal_detectedAt_priceAfter15m_idx" ON "Signal"("detectedAt", "priceAfter15m");

-- CreateIndex
CREATE INDEX CONCURRENTLY "Signal_detectedAt_priceAfter1h_idx" ON "Signal"("detectedAt", "priceAfter1h");
