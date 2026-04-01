import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "pending";

  const callbacks = await prisma.callback.findMany({
    where: { status },
    include: { lead: true },
    orderBy: { scheduledAt: "asc" },
  });

  return NextResponse.json({ callbacks });
}

export async function PATCH(req: NextRequest) {
  const { id, status } = await req.json();

  const callback = await prisma.callback.update({
    where: { id },
    data: { status },
  });

  return NextResponse.json({ callback });
}
