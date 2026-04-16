import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkCORS, corsHeaders, isValidEmail } from "@/lib/website-chat";

export async function OPTIONS(req: NextRequest) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  try {
    const body = await req.json();
    const { siteId, sessionId, name, email, phone, notes } = body;

    if (!siteId || !sessionId || !email) {
      return NextResponse.json(
        { error: "siteId, sessionId, email required" },
        { status: 400, headers }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Invalid email" },
        { status: 400, headers }
      );
    }

    const site = await prisma.websiteConfig.findUnique({
      where: { siteId },
    });

    if (!site || !site.enabled) {
      return NextResponse.json(
        { error: "Site not found" },
        { status: 404, headers }
      );
    }

    if (!checkCORS(origin, site.allowedOrigins as string[])) {
      return NextResponse.json(
        { error: "Origin not allowed" },
        { status: 403, headers }
      );
    }

    const conversation = await prisma.websiteConversation.findUnique({
      where: { sessionId },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404, headers }
      );
    }

    const organizationId = site.organizationId;
    // Find or create lead
    let lead = phone
      ? await prisma.lead.findUnique({
          where: { organizationId_phone: { organizationId, phone } },
        })
      : null;

    if (!lead) {
      lead = await prisma.lead.create({
        data: {
          organizationId,
          name: name || null,
          email,
          phone: phone || `website-${sessionId.slice(0, 8)}`,
          source: "website",
          notes: notes || null,
        },
      });
    } else {
      lead = await prisma.lead.update({
        where: { id: lead.id },
        data: {
          name: lead.name || name || null,
          email: lead.email || email || null,
        },
      });
    }

    await prisma.websiteConversation.update({
      where: { id: conversation.id },
      data: {
        leadId: lead.id,
        visitorName: name || undefined,
        visitorEmail: email,
        visitorPhone: phone || undefined,
      },
    });

    return NextResponse.json({ success: true, leadId: lead.id }, { headers });
  } catch (error) {
    console.error("[WEBSITE CHAT LEAD] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers }
    );
  }
}
