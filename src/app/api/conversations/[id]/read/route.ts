import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenant, isErrorResponse } from "@/lib/tenant";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenant(req);
  if (isErrorResponse(ctx)) return ctx;

  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const channel = searchParams.get("channel") || "whatsapp";

    if (channel === "website") {
      const existing = await prisma.websiteConversation.findUnique({
        where: { id },
        select: { organizationId: true },
      });
      if (!existing || existing.organizationId !== ctx.organizationId) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const updated = await prisma.websiteConversation.update({
        where: { id },
        data: { isRead: true },
        select: { id: true, isRead: true },
      });
      return NextResponse.json(updated);
    }

    const existing = await prisma.whatsAppConversation.findUnique({
      where: { id },
      select: { organizationId: true },
    });
    if (!existing || existing.organizationId !== ctx.organizationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updated = await prisma.whatsAppConversation.update({
      where: { id },
      data: { isRead: true },
      select: { id: true, isRead: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[READ API] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
