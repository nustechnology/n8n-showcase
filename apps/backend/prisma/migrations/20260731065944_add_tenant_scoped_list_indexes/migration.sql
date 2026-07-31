-- CreateIndex
CREATE INDEX "orders_tenant_id_created_at_idx" ON "orders"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "workflow_runs_tenant_id_started_at_idx" ON "workflow_runs"("tenant_id", "started_at");
