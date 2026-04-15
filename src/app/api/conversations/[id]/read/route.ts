import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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
