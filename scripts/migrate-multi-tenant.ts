/**
 * One-shot migration script to transition from single-tenant to multi-tenant.
 *
 * Steps:
 *  1. Create the DOAI super-admin organization (slug="doai").
 *  2. Copy existing BusinessSettings (id="default") into OrganizationSettings for DOAI.
 *  3. Backfill organizationId on all pre-existing Calls, Leads, Callbacks,
 *     WhatsAppConversations, WebsiteConfigs, WebsiteConversations.
 *  4. Create a super-admin User for Roy.
 *  5. Register the existing WhatsApp phone number under DOAI's PhoneNumber table.
 *
 * Run with:
 *   DATABASE_URL=... WHATSAPP_PHONE_NUMBER_ID=... SUPER_ADMIN_EMAIL=... \
 *     npx tsx scripts/migrate-multi-tenant.ts
 *
 * Safe to run multiple times — checks for existing rows before inserting.
 */

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const DOAI_SLUG = "doai";
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || "roy@doaisystems.co.uk";
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

async function main() {
  console.log("🚀 Starting multi-tenant migration");

  // 1. Ensure DOAI organization exists
  let doaiOrg = await prisma.organization.findUnique({
    where: { slug: DOAI_SLUG },
  });

  if (!doaiOrg) {
    doaiOrg = await prisma.organization.create({
      data: {
        name: "DOAI Systems",
        slug: DOAI_SLUG,
        planTier: "custom",
      },
    });
    console.log("✅ Created DOAI organization:", doaiOrg.id);
  } else {
    console.log("↩️  DOAI organization already exists:", doaiOrg.id);
  }

  // 2. Ensure OrganizationSettings exists for DOAI (copy from BusinessSettings if found)
  const existingOrgSettings = await prisma.organizationSettings.findUnique({
    where: { organizationId: doaiOrg.id },
  });

  if (!existingOrgSettings) {
    // Try to read the old BusinessSettings table via raw SQL (safe if table still exists)
    try {
      const oldSettings = await prisma.$queryRawUnsafe<
        Array<{
          businessName: string;
          businessDescription: string;
          services: unknown;
          teamMembers: unknown;
          operatingHours: unknown;
          greetingMessage: string | null;
          vapiAssistantId: string | null;
          vapiPhoneNumberId: string | null;
          whatsappSystemPrompt: string | null;
          whatsappEnabled: boolean;
        }>
      >(`SELECT * FROM ca_business_settings WHERE id = 'default' LIMIT 1`);

      if (oldSettings.length > 0) {
        const o = oldSettings[0];
        await prisma.organizationSettings.create({
          data: {
            organizationId: doaiOrg.id,
            businessName: o.businessName || "DOAI Systems",
            businessDescription: o.businessDescription || "",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            services: o.services as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            teamMembers: o.teamMembers as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            operatingHours: o.operatingHours as any,
            greetingMessage: o.greetingMessage,
            vapiAssistantId: o.vapiAssistantId,
            vapiPhoneNumberId: o.vapiPhoneNumberId,
            whatsappSystemPrompt: o.whatsappSystemPrompt,
            whatsappEnabled: o.whatsappEnabled ?? false,
          },
        });
        console.log("✅ Copied BusinessSettings → OrganizationSettings");
      } else {
        await prisma.organizationSettings.create({
          data: {
            organizationId: doaiOrg.id,
            businessName: "DOAI Systems",
            businessDescription: "AI-powered technology solutions for businesses",
          },
        });
        console.log("✅ Created fresh OrganizationSettings for DOAI");
      }
    } catch (err) {
      console.log(
        "ℹ️  Old ca_business_settings table not found (that's fine):",
        err instanceof Error ? err.message : err
      );
      await prisma.organizationSettings.create({
        data: {
          organizationId: doaiOrg.id,
          businessName: "DOAI Systems",
        },
      });
    }
  } else {
    console.log("↩️  OrganizationSettings already exists");
  }

  // 3. Backfill organizationId on existing records (null = pre-migration data)
  const backfill = async (table: string) => {
    const result = await prisma.$executeRawUnsafe(
      `UPDATE "${table}" SET "organizationId" = $1 WHERE "organizationId" IS NULL OR "organizationId" = ''`,
      doaiOrg!.id
    );
    console.log(`  - ${table}: ${result} rows`);
  };

  console.log("🔄 Backfilling organizationId...");
  try {
    await backfill("ca_calls");
    await backfill("ca_leads");
    await backfill("ca_callbacks");
    await backfill("ca_whatsapp_conversations");
    await backfill("ca_website_configs");
    await backfill("ca_website_conversations");
  } catch (err) {
    console.warn(
      "⚠️  Backfill may have failed (may already be complete):",
      err instanceof Error ? err.message : err
    );
  }

  // 4. Create super-admin user
  const existingAdmin = await prisma.user.findUnique({
    where: { email: SUPER_ADMIN_EMAIL },
  });

  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        email: SUPER_ADMIN_EMAIL,
        role: "superAdmin",
        organizationId: doaiOrg.id,
      },
    });
    console.log("✅ Created super-admin:", SUPER_ADMIN_EMAIL);
  } else if (existingAdmin.role !== "superAdmin") {
    await prisma.user.update({
      where: { id: existingAdmin.id },
      data: { role: "superAdmin", organizationId: doaiOrg.id },
    });
    console.log("✅ Promoted existing user to super-admin");
  } else {
    console.log("↩️  Super-admin already exists");
  }

  // 5. Register DOAI's WhatsApp phone number
  if (WHATSAPP_PHONE_NUMBER_ID) {
    const existing = await prisma.phoneNumber.findFirst({
      where: { whatsappPhoneNumberId: WHATSAPP_PHONE_NUMBER_ID },
    });
    if (!existing) {
      await prisma.phoneNumber.create({
        data: {
          organizationId: doaiOrg.id,
          number: "+0-doai-whatsapp-test", // placeholder — update manually in UI
          channel: "whatsapp",
          whatsappPhoneNumberId: WHATSAPP_PHONE_NUMBER_ID,
          label: "DOAI WhatsApp (test number)",
        },
      });
      console.log("✅ Registered WhatsApp phone number:", WHATSAPP_PHONE_NUMBER_ID);
    } else {
      console.log("↩️  WhatsApp phone number already registered");
    }
  } else {
    console.log("ℹ️  Skipped WhatsApp phone registration (WHATSAPP_PHONE_NUMBER_ID not set)");
  }

  console.log("✅ Migration complete");
}

main()
  .catch((err) => {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
