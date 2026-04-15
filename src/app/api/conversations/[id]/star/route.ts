import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const conversation = await prisma.whatsAppConversation.findUnique({
      where: { id },
      select: { starred: true },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updated = await prisma.whatsAppConversation.update({
      where: { id },
      data: { starred: !conversation.starred },
      select: { id: true, starred: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[STAR API] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
