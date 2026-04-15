import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const filter = searchParams.get("filter");
    const search = searchParams.get("search");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (filter === "unread") {
      where.isRead = false;
    } else if (filter === "starred") {
      where.starred = true;
    } else if (filter === "recent") {
      where.lastMessageAt = {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
      };
    }

    if (search) {
      where.OR = [
        { contactName: { contains: search, mode: "insensitive" } },
        { phoneNumber: { contains: search } },
        { lead: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [conversations, total] = await Promise.all([
      prisma.whatsAppConversation.findMany({
        where,
        include: {
          lead: true,
          _count: { select: { messages: true } },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { content: true, role: true, createdAt: true },
          },
        },
        orderBy: { lastMessageAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.whatsAppConversation.count({ where }),
    ]);

    return NextResponse.json({
      conversations,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("[CONVERSATIONS API] GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
