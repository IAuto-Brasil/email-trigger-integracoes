-- CreateTable
CREATE TABLE "public"."ParsedEmailCache" (
    "id" SERIAL NOT NULL,
    "messageId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParsedEmailCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ParsedEmailCache_messageId_key" ON "public"."ParsedEmailCache"("messageId");
