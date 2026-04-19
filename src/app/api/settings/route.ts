import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenant, isErrorResponse } from "@/lib/tenant";

const DEFAULT_SETTINGS = {
  businessName: "Our Business",
  teamMembers: [],
};

// Fields only super-admins can change. Non-super-admins attempting to set
// these have them silently stripped from the update payload.
const SUPER_ADMIN_ONLY_FIELDS = [
  "whatsappSystemPrompt",
  "whatsappEnabled",
  "chatbotEnabled",
  "voiceEnabled",
  "vapiAssistantId",
  "vapiPhoneNumberId",
];

export async function GET(req: NextRequest) {
  const ctx = await requireTenant(req);
  if (isErrorResponse(ctx)) return ctx;

  try {
    let settings = await prisma.organizationSettings.findUnique({
      where: { organizationId: ctx.organizationId },
    });

    if (!settings) {
      const org = await prisma.organization.findUnique({
        where: { id: ctx.organizationId },
        select: { name: true },
      });
      settings = await prisma.organizationSettings.create({
        data: {
          organizationId: ctx.organizationId,
          businessName: org?.name || DEFAULT_SETTINGS.businessName,
          teamMembers: DEFAULT_SETTINGS.teamMembers,
        },
      });
    }

    return NextResponse.json({ settings });
  } catch (error) {
    console.error("[SETTINGS API] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const ctx = await requireTenant(req);
  if (isErrorResponse(ctx)) return ctx;

  try {
    const raw = await req.json();

    if (!raw || typeof raw !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    // Never allow changing the row id / org link from the client.
    const data: Record<string, unknown> = { ...raw };
    delete data.id;
    delete data.organizationId;

    // Strip super-admin-only fields unless the caller is a super-admin.
    if (ctx.role !== "superAdmin") {
      for (const f of SUPER_ADMIN_ONLY_FIELDS) {
        if (f in data) delete data[f];
      }
    }

    const settings = await prisma.organizationSettings.upsert({
      where: { organizationId: ctx.organizationId },
      update: data,
      create: {
        organizationId: ctx.organizationId,
        businessName:
          (data.businessName as string | undefined) ||
          DEFAULT_SETTINGS.businessName,
        ...data,
      },
    });

    return NextResponse.json({ settings });
  } catch (error) {
    console.error("[SETTINGS API] PUT error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
