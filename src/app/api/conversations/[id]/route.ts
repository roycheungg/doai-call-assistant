import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenant, isErrorResponse } from "@/lib/tenant";

export async function GET(
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
      const conv = await prisma.websiteConversation.findUnique({
        where: { id },
        include: {
          lead: true,
          site: { select: { name: true, siteId: true, botName: true } },
          messages: { orderBy: { createdAt: "asc" } },
        },
      });

      if (!conv || conv.organizationId !== ctx.organizationId) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      return NextResponse.json({
        id: conv.id,
        channel: "website",
        contactName: conv.visitorName,
        phoneNumber: conv.visitorPhone || "",
        visitorEmail: conv.visitorEmail,
        visitorPhone: conv.visitorPhone,
        status: conv.status,
        isRead: conv.isRead,
        starred: conv.starred,
        createdAt: conv.createdAt,
        lastMessageAt: conv.lastMessageAt,
        userAgent: conv.userAgent,
        referrer: conv.referrer,
        site: conv.site,
        lead: conv.lead,
        messages: conv.messages,
      });
    }

    if (channel === "instagram" || channel === "facebook") {
      const conv = await prisma.socialConversation.findUnique({
        where: { id },
        include: {
          lead: true,
          messages: { orderBy: { createdAt: "asc" } },
        },
      });

      if (!conv || conv.organizationId !== ctx.organizationId) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      return NextResponse.json({
        id: conv.id,
        channel: conv.channel,
        contactName: conv.contactName,
        phoneNumber: conv.externalUserId, // display the IG/FB handle-equivalent
        status: conv.status,
        isRead: conv.isRead,
        starred: conv.starred,
        createdAt: conv.createdAt,
        lastMessageAt: conv.lastMessageAt,
        lead: conv.lead,
        messages: conv.messages,
      });
    }

    const conversation = await prisma.whatsAppConversation.findUnique({
      where: { id },
      include: {
        lead: true,
        messages: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!conversation || conversation.organizationId !== ctx.organizationId) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...conversation,
      channel: "whatsapp",
    });
  } catch (error) {
    console.error("[CONVERSATION API] GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
