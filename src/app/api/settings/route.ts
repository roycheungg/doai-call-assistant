import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenant, isErrorResponse } from "@/lib/tenant";

const DEFAULT_SETTINGS = {
  businessName: "Our Business",
  businessDescription: "",
  services: [],
  teamMembers: [],
  operatingHours: { start: "09:00", end: "17:00", timezone: "Europe/London", days: [1, 2, 3, 4, 5] },
};

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
          businessDescription: DEFAULT_SETTINGS.businessDescription,
          services: DEFAULT_SETTINGS.services,
          teamMembers: DEFAULT_SETTINGS.teamMembers,
          operatingHours: DEFAULT_SETTINGS.operatingHours,
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
    const data = await req.json();

    if (!data || typeof data !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    // Prevent clients from changing their own organizationId
    delete data.id;
    delete data.organizationId;

    const settings = await prisma.organizationSettings.upsert({
      where: { organizationId: ctx.organizationId },
      update: data,
      create: {
        organizationId: ctx.organizationId,
        businessName: data.businessName || DEFAULT_SETTINGS.businessName,
        ...data,
      },
    });

    return NextResponse.json({ settings });
  } catch (error) {
    console.error("[SETTINGS API] PUT error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
