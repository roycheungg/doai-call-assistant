import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  sendTextMessage,
  markAsRead,
  verifySignature,
  waIdToPhone,
} from "@/lib/whatsapp";
import { buildSystemPrompt, getChatResponse } from "@/lib/claude";
import { rateLimit } from "@/lib/rate-limit";

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

  // Route to the right org via the WhatsApp phone number ID
  const metadata = value.metadata as Record<string, unknown> | undefined;
  const phoneNumberId =
    (metadata?.phone_number_id as string) || process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!phoneNumberId) {
    console.warn("[WHATSAPP WEBHOOK] No phone_number_id in payload");
    return;
  }

  const phoneRecord = await prisma.phoneNumber.findFirst({
    where: { whatsappPhoneNumberId: phoneNumberId, channel: "whatsapp" },
    select: { organizationId: true },
  });

  if (!phoneRecord) {
    console.warn(
      "[WHATSAPP WEBHOOK] Unrecognised phone_number_id:",
      phoneNumberId
    );
    return;
  }

  const organizationId = phoneRecord.organizationId;

  // Feature gate: org must have WhatsApp enabled
  const orgSettings = await prisma.organizationSettings.findUnique({
    where: { organizationId },
    select: { whatsappEnabled: true },
  });
  if (!orgSettings?.whatsappEnabled) {
    console.log(
      "[WHATSAPP WEBHOOK] whatsappEnabled=false for org, ignoring:",
      organizationId
    );
    return;
  }

  const contacts = value.contacts as Array<Record<string, unknown>>;
  const contactProfile = contacts?.[0]?.profile as Record<string, unknown>;
  const contactName = (contactProfile?.name as string) || null;

  for (const message of messages) {
    try {
      await processMessage(message, contactName, organizationId);
    } catch (err) {
      console.error("[WHATSAPP WEBHOOK] Error processing message:", err);
    }
  }
}

async function processMessage(
  message: Record<string, unknown>,
  contactName: string | null,
  organizationId: string
) {
  const waId = message.from as string;
  const waMessageId = message.id as string;
  const messageType = message.type as string;

  if (!waId || !waMessageId) return;

  // Rate limit per-sender. Scoped by org so one spammer can't starve other
  // tenants. Burst of 10, refill 1/s — comfortable for real users, blocks
  // flood patterns. Skip silently (no reply) to avoid cost blowup + to not
  // tip off the attacker.
  const rl = rateLimit("whatsapp-sender", `${organizationId}:${waId}`);
  if (!rl.allowed) {
    console.warn(
      "[WHATSAPP WEBHOOK] Rate limited:",
      waId,
      "retryAfterMs=",
      rl.retryAfterMs
    );
    return;
  }

  const existing = await prisma.whatsAppMessage.findUnique({
    where: { waMessageId },
  });
  if (existing) {
    console.log("[WHATSAPP WEBHOOK] Duplicate message, skipping:", waMessageId);
    return;
  }

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

  let conversation = await prisma.whatsAppConversation.findUnique({
    where: { organizationId_waId: { organizationId, waId } },
  });

  if (!conversation) {
    // Find or create lead (scoped to this org)
    let lead = await prisma.lead.findUnique({
      where: { organizationId_phone: { organizationId, phone } },
    });
    if (!lead) {
      lead = await prisma.lead.create({
        data: {
          organizationId,
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
        organizationId,
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

  await prisma.whatsAppMessage.create({
    data: {
      conversationId: conversation.id,
      role: "user",
      content: textBody,
      waMessageId,
    },
  });

  const history = await prisma.whatsAppMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  });

  const chatMessages = history.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const systemPrompt = await buildSystemPrompt(organizationId);
  const aiResponse = await getChatResponse(chatMessages, systemPrompt, {
    organizationId,
    channel: "whatsapp",
    allowCLI: true,
    // Let Claude extract issue / name / email / company onto the lead
    // when the customer shares them. Mirrors the Vapi voice flow.
    extractToLead: conversation.leadId
      ? { leadId: conversation.leadId }
      : undefined,
  });

  const sendResult = await sendTextMessage(waId, aiResponse);

  await prisma.whatsAppMessage.create({
    data: {
      conversationId: conversation.id,
      role: "assistant",
      content: aiResponse,
      waMessageId: sendResult.messageId,
      status: sendResult.success ? "sent" : "failed",
    },
  });

  await prisma.whatsAppConversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), isRead: false },
  });

  markAsRead(waMessageId);
}
