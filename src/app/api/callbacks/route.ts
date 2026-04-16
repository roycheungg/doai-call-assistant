import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenant, isErrorResponse } from "@/lib/tenant";

export async function GET(req: NextRequest) {
  const ctx = await requireTenant(req);
  if (isErrorResponse(ctx)) return ctx;

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "pending";

    const callbacks = await prisma.callback.findMany({
      where: { status, organizationId: ctx.organizationId },
      include: { lead: true },
      orderBy: { scheduledAt: "asc" },
    });

    return NextResponse.json({ callbacks });
  } catch (error) {
    console.error("[CALLBACKS API] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireTenant(req);
  if (isErrorResponse(ctx)) return ctx;

  try {
    const { id, status } = await req.json();

    if (!id || !status) {
      return NextResponse.json({ error: "id and status are required" }, { status: 400 });
    }

    // Verify ownership
    const existing = await prisma.callback.findUnique({
      where: { id },
      select: { organizationId: true },
    });
    if (!existing || existing.organizationId !== ctx.organizationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const callback = await prisma.callback.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json({ callback });
  } catch (error) {
    console.error("[CALLBACKS API] PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
