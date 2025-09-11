-- CreateTable
CREATE TABLE "public"."ProcessedEmail" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "uid" INTEGER NOT NULL,
    "accountEmail" TEXT NOT NULL,
    "fromEmail" TEXT,
    "toEmail" TEXT,
    "subject" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedEmail_messageId_key" ON "public"."ProcessedEmail"("messageId");

-- CreateIndex
CREATE INDEX "ProcessedEmail_accountEmail_receivedAt_idx" ON "public"."ProcessedEmail"("accountEmail", "receivedAt");

-- CreateIndex
CREATE INDEX "ProcessedEmail_messageId_idx" ON "public"."ProcessedEmail"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedEmail_uid_accountEmail_key" ON "public"."ProcessedEmail"("uid", "accountEmail");
