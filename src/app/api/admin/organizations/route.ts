import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, isErrorResponse } from "@/lib/tenant";

export async function GET() {
  const ctx = await requireSuperAdmin();
  if (isErrorResponse(ctx)) return ctx;

  try {
    const orgs = await prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            users: true,
            leads: true,
            calls: true,
            phoneNumbers: true,
            websites: true,
          },
        },
      },
    });
    return NextResponse.json({ organizations: orgs });
  } catch (error) {
    console.error("[ADMIN ORGS] GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireSuperAdmin();
  if (isErrorResponse(ctx)) return ctx;

  try {
    const body = await req.json();
    const { name, slug, planTier } = body;

    if (!name || !slug) {
      return NextResponse.json(
        { error: "name and slug are required" },
        { status: 400 }
      );
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      return NextResponse.json(
        { error: "slug must be lowercase alphanumeric with dashes" },
        { status: 400 }
      );
    }

    const org = await prisma.organization.create({
      data: {
        name,
        slug,
        planTier: planTier || "starter",
        settings: {
          create: {
            businessName: name,
          },
        },
      },
      include: { settings: true },
    });

    return NextResponse.json(org);
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = error as any;
    if (err.code === "P2002") {
      return NextResponse.json({ error: "slug already exists" }, { status: 409 });
    }
    console.error("[ADMIN ORGS] POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
