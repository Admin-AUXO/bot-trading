-- CreateIndex for WalletActivity
CREATE INDEX "WalletActivity_detectedAt_priceAfter1m_idx" ON "WalletActivity"("detectedAt", "priceAfter1m");

-- CreateIndex for WalletActivity
CREATE INDEX "WalletActivity_detectedAt_priceAfter5m_idx" ON "WalletActivity"("detectedAt", "priceAfter5m");

-- CreateIndex for GraduationEvent
CREATE INDEX "GraduationEvent_graduatedAt_priceAfter1m_idx" ON "GraduationEvent"("graduatedAt", "priceAfter1m");

-- CreateIndex for GraduationEvent
CREATE INDEX "GraduationEvent_graduatedAt_priceAfter5m_idx" ON "GraduationEvent"("graduatedAt", "priceAfter5m");
