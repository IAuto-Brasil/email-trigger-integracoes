-- CreateTable
CREATE TABLE "public"."received_emails" (
    "id" SERIAL NOT NULL,
    "emailId" INTEGER NOT NULL,
    "fromEmail" TEXT,
    "toEmail" TEXT,
    "subject" TEXT,
    "textContent" TEXT,
    "htmlContent" TEXT,
    "attachments" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "received_emails_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."received_emails" ADD CONSTRAINT "received_emails_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "public"."emails"("id") ON DELETE CASCADE ON UPDATE CASCADE;
