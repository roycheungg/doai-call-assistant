import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "pending";

    const callbacks = await prisma.callback.findMany({
      where: { status },
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
  try {
    const { id, status } = await req.json();

    if (!id || !status) {
      return NextResponse.json({ error: "id and status are required" }, { status: 400 });
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
