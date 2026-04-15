import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  sendTextMessage,
  markAsRead,
  verifySignature,
  waIdToPhone,
} from "@/lib/whatsapp";
import { buildSystemPrompt, getChatResponse } from "@/lib/claude";

// GET - Meta webhook verification
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log("[WHATSAPP WEBHOOK] Verification successful");
    return new Response(challenge, { status: 200 });
  }

  console.warn("[WHATSAPP WEBHOOK] Verification failed");
  return new Response("Forbidden", { status: 403 });
}

// POST - Incoming messages
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifySignature(rawBody, signature)) {
    console.warn("[WHATSAPP WEBHOOK] Invalid signature");
    return new Response("Unauthorized", { status: 401 });
  }

  const body = JSON.parse(rawBody);

  // Fire-and-forget - return 200 immediately so Meta doesn't retry
  processWebhook(body).catch((err) =>
    console.error("[WHATSAPP WEBHOOK] Processing error:", err)
  );

  return NextResponse.json({ status: "ok" }, { status: 200 });
}

async function processWebhook(body: Record<string, unknown>) {
  const entry = (body.entry as Array<Record<string, unknown>>)?.[0];
  if (!entry) return;

  const changes = (entry.changes as Array<Record<string, unknown>>)?.[0];
  if (!changes) return;

  const value = changes.value as Record<string, unknown>;
  if (!value) return;

  const messages = value.messages as Array<Record<string, unknown>>;
  if (!messages || messages.length === 0) return;

  const contacts = value.contacts as Array<Record<string, unknown>>;
  const contactProfile = contacts?.[0]?.profile as Record<string, unknown>;
  const contactName = (contactProfile?.name as string) || null;

  for (const message of messages) {
    try {
      await processMessage(message, contactName);
    } catch (err) {
      console.error("[WHATSAPP WEBHOOK] Error processing message:", err);
    }
  }
}

async function processMessage(
  message: Record<string, unknown>,
  contactName: string | null
) {
  const waId = message.from as string;
  const waMessageId = message.id as string;
  const messageType = message.type as string;

  if (!waId || !waMessageId) return;

  // Deduplicate - Meta can re-deliver webhooks
  const existing = await prisma.whatsAppMessage.findUnique({
    where: { waMessageId },
  });
  if (existing) {
    console.log("[WHATSAPP WEBHOOK] Duplicate message, skipping:", waMessageId);
    return;
  }

  // Only handle text messages for now
  if (messageType !== "text") {
    await sendTextMessage(
      waId,
      "Thanks for your message! I can currently only process text messages. Please send your question as text."
    );
    return;
  }

  const textBody = (message.text as Record<string, unknown>)?.body as string;
  if (!textBody) return;

  const phone = waIdToPhone(waId);

  // Find or create conversation
  let conversation = await prisma.whatsAppConversation.findUnique({
    where: { waId },
  });

  if (!conversation) {
    // Find or create lead
    let lead = await prisma.lead.findUnique({ where: { phone } });
    if (!lead) {
      lead = await prisma.lead.create({
        data: {
          phone,
          name: contactName,
          source: "whatsapp",
        },
      });
    } else if (contactName && !lead.name) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { name: contactName },
      });
    }

    conversation = await prisma.whatsAppConversation.create({
      data: {
        waId,
        phoneNumber: phone,
        contactName,
        leadId: lead.id,
      },
    });
  } else if (contactName && !conversation.contactName) {
    await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: { contactName },
    });
  }

  // Store user message
  await prisma.whatsAppMessage.create({
    data: {
      conversationId: conversation.id,
      role: "user",
      content: textBody,
      waMessageId,
    },
  });

  // Load conversation history for Claude context
  const history = await prisma.whatsAppMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  });

  const chatMessages = history.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Get Claude response
  const systemPrompt = await buildSystemPrompt();
  const aiResponse = await getChatResponse(chatMessages, systemPrompt);

  // Send response via WhatsApp
  const sendResult = await sendTextMessage(waId, aiResponse);

  // Store assistant message
  await prisma.whatsAppMessage.create({
    data: {
      conversationId: conversation.id,
      role: "assistant",
      content: aiResponse,
      waMessageId: sendResult.messageId,
      status: sendResult.success ? "sent" : "failed",
    },
  });

  // Update conversation timestamp and mark as unread
  await prisma.whatsAppConversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), isRead: false },
  });

  // Mark incoming message as read (blue ticks)
  markAsRead(waMessageId);
}
