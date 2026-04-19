/**
 * Instagram DMs + Facebook Messenger integration via Meta's Graph API.
 *
 * One module for both because the webhook payload shape, send-message
 * endpoint, auth model, and ingest logic are ~90% identical — only the
 * `object` field, the org-lookup column, and the send-body differ.
 *
 * Webhook delivery:
 *   - Instagram:  `body.object === "instagram"`, entry.id = IG business id
 *   - Messenger:  `body.object === "page"`,       entry.id = Page id
 *
 * Per-org credentials (business id, access token, system prompt, enabled
 * flag) live on `OrganizationSettings` — set by super-admins via
 * `/admin/organizations/<id>`. There is no global env access token; each
 * org brings its own.
 *
 * Signature verification uses `META_APP_SECRET` env var, HMAC-SHA256 over
 * the raw body, header `x-hub-signature-256` prefixed with `sha256=`.
 * Prod-fail-closed: missing secret in prod → reject all webhooks.
 */

import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import { buildSystemPrompt, getChatResponse } from "@/lib/claude";

const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";
const APP_SECRET = process.env.META_APP_SECRET;

export type SocialChannel = "instagram" | "facebook";

if (!APP_SECRET) {
  if (process.env.NODE_ENV === "production") {
    console.error(
      "[META] META_APP_SECRET is not set — ALL incoming Meta webhooks will be rejected."
    );
  } else {
    console.warn(
      "[META] META_APP_SECRET not set — dev-only bypass active. Unsigned webhooks will be accepted."
    );
  }
}

/**
 * HMAC-SHA256 signature verification for Meta webhook callbacks.
 * Mirrors WhatsApp's pattern but uses a dedicated secret so the two
 * subscriptions can be configured independently.
 */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  if (!APP_SECRET) {
    // Production: missing secret = cannot verify = reject.
    // Dev: allow so local curl-simulate works.
    return process.env.NODE_ENV !== "production";
  }
  if (!signatureHeader) return false;

  const expected = signatureHeader.replace("sha256=", "");
  const computed = createHmac("sha256", APP_SECRET)
    .update(rawBody)
    .digest("hex");
  return expected === computed;
}

// ─────────────────────────────────────────────────────────────
// Webhook payload types (trimmed to what we actually use)
// ─────────────────────────────────────────────────────────────

interface MetaMessage {
  mid: string;
  text?: string;
  attachments?: unknown[];
}

interface MetaMessagingEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: MetaMessage;
}

interface MetaEntry {
  id: string;
  time: number;
  messaging?: MetaMessagingEvent[];
}

export interface MetaWebhookBody {
  object: string; // "instagram" | "page"
  entry: MetaEntry[];
}

// ─────────────────────────────────────────────────────────────
// Org resolution + feature gating
// ─────────────────────────────────────────────────────────────

interface OrgContext {
  organizationId: string;
  accessToken: string;
  accountId: string; // IG business id OR FB page id
}

async function resolveOrgFor(
  channel: SocialChannel,
  entryId: string
): Promise<OrgContext | null> {
  const where =
    channel === "instagram"
      ? { instagramBusinessId: entryId, instagramEnabled: true }
      : { facebookPageId: entryId, facebookEnabled: true };

  // One select shape for both channels avoids TS narrowing headaches.
  const settings = await prisma.organizationSettings.findFirst({
    where,
    select: {
      organizationId: true,
      instagramBusinessId: true,
      instagramAccessToken: true,
      facebookPageId: true,
      facebookPageAccessToken: true,
    },
  });
  if (!settings) return null;

  const accessToken =
    channel === "instagram"
      ? settings.instagramAccessToken
      : settings.facebookPageAccessToken;
  const accountId =
    channel === "instagram"
      ? settings.instagramBusinessId
      : settings.facebookPageId;

  if (!accessToken || !accountId) return null;
  return { organizationId: settings.organizationId, accessToken, accountId };
}

// ─────────────────────────────────────────────────────────────
// Outbound — channel-specific send-message bodies
// ─────────────────────────────────────────────────────────────

async function sendText(
  ctx: OrgContext,
  channel: SocialChannel,
  recipientId: string,
  text: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  // Graph API hard caps message body at 2000 chars for Messenger / IG DM.
  // Keep a comfortable margin.
  const truncated = text.length > 1800 ? text.slice(0, 1797) + "..." : text;

  const url = `${GRAPH_API_BASE}/${ctx.accountId}/messages`;
  const payload: Record<string, unknown> = {
    recipient: { id: recipientId },
    message: { text: truncated },
  };
  // Messenger requires `messaging_type` for post-24h compliance. For IG
  // Messaging the field is ignored; adding it unconditionally is safe.
  if (channel === "facebook") {
    payload.messaging_type = "RESPONSE";
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(
      `[META ${channel.toUpperCase()}] Send failed (${res.status}): ${body.slice(0, 300)}`
    );
    return {
      success: false,
      error: `Meta API error ${res.status}: ${body.slice(0, 200)}`,
    };
  }

  const data = (await res.json().catch(() => ({}))) as { message_id?: string };
  return { success: true, messageId: data.message_id };
}

// ─────────────────────────────────────────────────────────────
// Inbound — walk the payload and handle each message
// ─────────────────────────────────────────────────────────────

/**
 * Entry point for the webhook route. Dispatches by `body.object`.
 * Fire-and-forget from the caller's perspective (returns Promise<void>).
 */
export async function processMetaWebhook(body: MetaWebhookBody): Promise<void> {
  const channel: SocialChannel | null =
    body.object === "instagram"
      ? "instagram"
      : body.object === "page"
      ? "facebook"
      : null;

  if (!channel) {
    console.log("[META] Ignoring webhook with unknown object:", body.object);
    return;
  }

  for (const entry of body.entry || []) {
    const ctx = await resolveOrgFor(channel, entry.id);
    if (!ctx) {
      console.log(
        `[META ${channel}] No org mapping for entry.id=${entry.id} (or feature disabled)`
      );
      continue;
    }

    for (const event of entry.messaging || []) {
      try {
        await processMessageEvent(channel, ctx, event);
      } catch (err) {
        console.error(`[META ${channel}] Error processing event:`, err);
      }
    }
  }
}

async function processMessageEvent(
  channel: SocialChannel,
  ctx: OrgContext,
  event: MetaMessagingEvent
): Promise<void> {
  const senderId = event.sender?.id;
  const message = event.message;
  if (!senderId || !message?.mid) return;

  // Ignore echoes of our own messages that Meta sends back (recipient.id
  // equals the business/page id — means we sent it, not the user).
  if (event.sender.id === ctx.accountId) return;

  // Skip duplicates (retries, ordering glitches).
  const existing = await prisma.socialMessage.findUnique({
    where: { externalMessageId: message.mid },
  });
  if (existing) {
    console.log(`[META ${channel}] Duplicate message, skipping:`, message.mid);
    return;
  }

  // Non-text messages: reply with a polite fallback so the sender knows
  // we got it but can't process media yet. Matches WhatsApp's UX today.
  const text = message.text?.trim();
  if (!text) {
    await sendText(
      ctx,
      channel,
      senderId,
      "Thanks for your message! I can currently only process text messages. Please send your question as text."
    );
    return;
  }

  // Upsert SocialConversation. We don't have a rich contact profile from
  // Meta on every event (that requires a second Graph call), so leave
  // contactName null — it can be enriched later.
  let conversation = await prisma.socialConversation.findUnique({
    where: {
      organizationId_channel_externalUserId: {
        organizationId: ctx.organizationId,
        channel,
        externalUserId: senderId,
      },
    },
  });

  if (!conversation) {
    // Best-effort lead linkage: social users don't give us a phone number,
    // so we park them as a synthetic phone using the sender id. This
    // matches how the website chat handles phone-less leads today.
    const syntheticPhone = `${channel}-${senderId.slice(0, 16)}`;
    let lead = await prisma.lead.findUnique({
      where: {
        organizationId_phone: {
          organizationId: ctx.organizationId,
          phone: syntheticPhone,
        },
      },
    });
    if (!lead) {
      lead = await prisma.lead.create({
        data: {
          organizationId: ctx.organizationId,
          phone: syntheticPhone,
          source: channel,
        },
      });
    }

    conversation = await prisma.socialConversation.create({
      data: {
        organizationId: ctx.organizationId,
        channel,
        externalUserId: senderId,
        leadId: lead.id,
      },
    });
  }

  // Save the user's inbound message.
  await prisma.socialMessage.create({
    data: {
      conversationId: conversation.id,
      role: "user",
      content: text,
      externalMessageId: message.mid,
    },
  });

  // Build conversation history for Claude.
  const history = await prisma.socialMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  });
  const chatMessages = history.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const systemPrompt = await buildSystemPrompt(ctx.organizationId, channel);
  const aiResponse = await getChatResponse(chatMessages, systemPrompt, {
    organizationId: ctx.organizationId,
    allowCLI: true,
  });

  const sendResult = await sendText(ctx, channel, senderId, aiResponse);

  await prisma.socialMessage.create({
    data: {
      conversationId: conversation.id,
      role: "assistant",
      content: aiResponse,
      externalMessageId: sendResult.messageId,
      status: sendResult.success ? "sent" : "failed",
    },
  });

  await prisma.socialConversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), isRead: false },
  });
}
