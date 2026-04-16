import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getChatResponse } from "@/lib/claude";
import {
  checkCORS,
  corsHeaders,
  parseLeadMarker,
  isValidEmail,
} from "@/lib/website-chat";

// Simple in-memory rate limiter
const RATE_LIMIT_TOKENS = 10;
const RATE_LIMIT_REFILL_RATE = 1; // tokens per second
const rateLimitBuckets = new Map<string, { tokens: number; lastRefill: number }>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key) || {
    tokens: RATE_LIMIT_TOKENS,
    lastRefill: now,
  };

  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(
    RATE_LIMIT_TOKENS,
    bucket.tokens + elapsed * RATE_LIMIT_REFILL_RATE
  );
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    rateLimitBuckets.set(key, bucket);
    return false;
  }

  bucket.tokens -= 1;
  rateLimitBuckets.set(key, bucket);
  return true;
}

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
    const { siteId, sessionId, message, userAgent, referrer } = body;

    if (!siteId || !sessionId || !message) {
      return new Response(
        JSON.stringify({ error: "siteId, sessionId, message required" }),
        { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    if (typeof message !== "string" || message.length > 4000) {
      return new Response(
        JSON.stringify({ error: "Invalid message" }),
        { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    // Load site config
    const site = await prisma.websiteConfig.findUnique({
      where: { siteId },
    });

    if (!site || !site.enabled) {
      return new Response(
        JSON.stringify({ error: "Site not found" }),
        { status: 404, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    // Verify CORS
    const allowedOrigins = site.allowedOrigins as string[];
    if (!checkCORS(origin, allowedOrigins)) {
      return new Response(
        JSON.stringify({ error: "Origin not allowed" }),
        { status: 403, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    // Rate limit by sessionId
    if (!checkRateLimit(sessionId)) {
      return new Response(
        JSON.stringify({ error: "Rate limited" }),
        { status: 429, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    // Find or create conversation
    let conversation = await prisma.websiteConversation.findUnique({
      where: { sessionId },
    });

    if (!conversation) {
      conversation = await prisma.websiteConversation.create({
        data: {
          organizationId: site.organizationId,
          siteId,
          sessionId,
          userAgent: userAgent || null,
          referrer: referrer || null,
        },
      });
    }

    // Store user message
    await prisma.websiteMessage.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: message,
      },
    });

    // Load conversation history
    const history = await prisma.websiteMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
      select: { role: true, content: true },
    });

    const chatMessages = history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // Get AI response
    const rawResponse = await getChatResponse(chatMessages, site.systemPrompt, {
      organizationId: site.organizationId,
      allowCLI: true,
    });

    // Parse for lead marker
    const { cleanText, lead } = parseLeadMarker(rawResponse);

    // Handle lead if captured
    if (lead && lead.email && isValidEmail(lead.email)) {
      const phone = lead.phone || "";
      const updateData: {
        visitorName?: string;
        visitorEmail?: string;
        visitorPhone?: string;
        leadId?: string;
      } = {
        visitorName: lead.name || undefined,
        visitorEmail: lead.email,
        visitorPhone: lead.phone || undefined,
      };

      if (phone) {
        const existing = await prisma.lead.findUnique({
          where: { organizationId_phone: { organizationId: site.organizationId, phone } },
        });
        if (existing) {
          updateData.leadId = existing.id;
          await prisma.lead.update({
            where: { id: existing.id },
            data: {
              name: existing.name || lead.name || null,
              email: existing.email || lead.email || null,
            },
          });
        } else {
          const created = await prisma.lead.create({
            data: {
              organizationId: site.organizationId,
              name: lead.name || null,
              email: lead.email,
              phone,
              source: "website",
              notes: lead.summary || null,
            },
          });
          updateData.leadId = created.id;
        }
      }

      await prisma.websiteConversation.update({
        where: { id: conversation.id },
        data: updateData,
      });
    }

    // Store assistant message (clean text without marker)
    await prisma.websiteMessage.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: cleanText,
      },
    });

    // Update conversation timestamp + mark unread for dashboard
    await prisma.websiteConversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date(), isRead: false },
    });

    // Stream the response as SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Chunk the text into small pieces for a "streaming" feel
        const chunkSize = 20;
        for (let i = 0; i < cleanText.length; i += chunkSize) {
          const chunk = cleanText.slice(i, i + chunkSize);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`)
          );
          await new Promise((r) => setTimeout(r, 20));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        ...headers,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[WEBSITE CHAT MESSAGE] error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }
}
