-- AlterTable: companyId passa a aceitar identificadores string (ex.: UUID, slug)
ALTER TABLE "emails" ALTER COLUMN "companyId" SET DATA TYPE TEXT USING "companyId"::text;

CREATE INDEX "emails_companyId_idx" ON "emails"("companyId");
