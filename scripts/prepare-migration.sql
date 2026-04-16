-- Manually prepare the database for the multi-tenant migration.
-- Run this FIRST, then run `prisma db push`, then run the migrate-multi-tenant.ts script.
--
-- This adds a temporary default org so existing rows can get organizationId = <doai org id>
-- without the schema push failing.

-- 1. Create the organizations table just enough to get an org row in
CREATE TABLE IF NOT EXISTS ca_organizations (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  "planTier" text NOT NULL DEFAULT 'starter',
  "anthropicApiKeyOverride" text,
  enabled boolean NOT NULL DEFAULT true,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create the DOAI org (idempotent)
INSERT INTO ca_organizations (id, name, slug, "planTier", "updatedAt")
VALUES ('doai-org-seed-0000000000001', 'DOAI Systems', 'doai', 'custom', CURRENT_TIMESTAMP)
ON CONFLICT (slug) DO NOTHING;

-- 3. Add organizationId column with default = DOAI org id, then remove default
ALTER TABLE ca_calls ADD COLUMN IF NOT EXISTS "organizationId" text NOT NULL DEFAULT 'doai-org-seed-0000000000001';
ALTER TABLE ca_calls ALTER COLUMN "organizationId" DROP DEFAULT;

ALTER TABLE ca_leads ADD COLUMN IF NOT EXISTS "organizationId" text NOT NULL DEFAULT 'doai-org-seed-0000000000001';
ALTER TABLE ca_leads ALTER COLUMN "organizationId" DROP DEFAULT;

ALTER TABLE ca_callbacks ADD COLUMN IF NOT EXISTS "organizationId" text NOT NULL DEFAULT 'doai-org-seed-0000000000001';
ALTER TABLE ca_callbacks ALTER COLUMN "organizationId" DROP DEFAULT;

ALTER TABLE ca_whatsapp_conversations ADD COLUMN IF NOT EXISTS "organizationId" text NOT NULL DEFAULT 'doai-org-seed-0000000000001';
ALTER TABLE ca_whatsapp_conversations ALTER COLUMN "organizationId" DROP DEFAULT;

ALTER TABLE ca_website_configs ADD COLUMN IF NOT EXISTS "organizationId" text NOT NULL DEFAULT 'doai-org-seed-0000000000001';
ALTER TABLE ca_website_configs ALTER COLUMN "organizationId" DROP DEFAULT;

ALTER TABLE ca_website_conversations ADD COLUMN IF NOT EXISTS "organizationId" text NOT NULL DEFAULT 'doai-org-seed-0000000000001';
ALTER TABLE ca_website_conversations ALTER COLUMN "organizationId" DROP DEFAULT;

-- 4. Drop the old phone unique constraint (Prisma will add the composite)
ALTER TABLE ca_leads DROP CONSTRAINT IF EXISTS "ca_leads_phone_key";
ALTER TABLE ca_whatsapp_conversations DROP CONSTRAINT IF EXISTS "ca_whatsapp_conversations_waId_key";
