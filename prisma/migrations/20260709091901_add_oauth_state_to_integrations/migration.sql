-- AlterTable
ALTER TABLE "integrations" ADD COLUMN "oauth_state" TEXT,
ADD COLUMN "oauth_state_expires_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "integrations_oauth_state_key" ON "integrations"("oauth_state");
