import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, isErrorResponse } from "@/lib/tenant";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; phoneId: string }> }
) {
  const ctx = await requireSuperAdmin();
  if (isErrorResponse(ctx)) return ctx;

  try {
    const { id: organizationId, phoneId } = await params;
    const existing = await prisma.phoneNumber.findUnique({
      where: { id: phoneId },
      select: { organizationId: true },
    });
    if (!existing || existing.organizationId !== organizationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await prisma.phoneNumber.delete({ where: { id: phoneId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ADMIN PHONE] DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
