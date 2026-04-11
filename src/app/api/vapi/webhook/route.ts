import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createHmac } from "crypto";

const WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET;

/**
 * Generate a basic summary from the transcript when Vapi doesn't provide one.
 * The transcript is a JSON array of {role, message} objects (or similar shapes).
 * Extracts the customer's messages and produces a 1-2 sentence summary.
 */
function generateSummaryFromTranscript(transcript: unknown): string | null {
  try {
    const messages: { role?: string; message?: string; text?: string; content?: string }[] =
      Array.isArray(transcript) ? transcript : [];

    if (messages.length === 0) return null;

    // Extract customer messages (user/customer role)
    const customerMessages = messages
      .filter((m) => m.role === "user" || m.role === "customer")
      .map((m) => m.message || m.text || m.content || "")
      .filter(Boolean);

    // Extract assistant messages for context
    const assistantMessages = messages
      .filter((m) => m.role === "assistant" || m.role === "bot")
      .map((m) => m.message || m.text || m.content || "")
      .filter(Boolean);

    if (customerMessages.length === 0 && assistantMessages.length === 0) return null;

    const totalMessages = messages.length;
    const customerText = customerMessages.join(" ").slice(0, 200);

    // Build a concise summary
    const parts: string[] = [];
    parts.push(`Call with ${totalMessages} exchanges.`);

    if (customerText) {
      // Take the first meaningful customer message as the topic
      const firstCustomerMsg = customerMessages[0]?.slice(0, 100);
      if (firstCustomerMsg && firstCustomerMsg.length > 10) {
        parts.push(`Customer discussed: "${firstCustomerMsg}${customerMessages[0]!.length > 100 ? "..." : ""}"`);
      }
    }

    // Check for callback/booking mentions
    const fullText = messages.map((m) => m.message || m.text || m.content || "").join(" ").toLowerCase();
    if (fullText.includes("callback") || fullText.includes("call back") || fullText.includes("call you back")) {
      parts.push("Callback was discussed.");
    }
    if (fullText.includes("book") || fullText.includes("appointment") || fullText.includes("schedule")) {
      parts.push("Booking/appointment was discussed.");
    }
    if (fullText.includes("transfer") || fullText.includes("speak to someone")) {
      parts.push("Transfer was requested.");
    }

    return parts.join(" ");
  } catch {
    return null;
  }
}

function verifyVapiSignature(payload: string, signature: string | null): boolean {
  if (!WEBHOOK_SECRET) return true; // Skip if no secret configured
  if (!signature) return false;
  const expected = createHmac("sha256", WEBHOOK_SECRET).update(payload).digest("hex");
  return signature === expected;
}

// GET handler for testing webhook accessibility
export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "Vapi webhook endpoint is reachable",
    timestamp: new Date().toISOString(),
  });
}

// Vapi sends webhook events for call lifecycle
// Docs: https://docs.vapi.ai/server-url/events
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();

    // Verify webhook signature if secret is configured
    const signature = req.headers.get("x-vapi-signature");
    if (WEBHOOK_SECRET && !verifyVapiSignature(rawBody, signature)) {
      console.warn("[VAPI WEBHOOK] Invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const body = JSON.parse(rawBody);

    // Log the full payload for debugging
    console.log("[VAPI WEBHOOK] Received:", JSON.stringify(body, null, 2));

    const message = body.message || body;
    const type = message.type;

    if (!type) {
      console.warn("[VAPI WEBHOOK] No message type found in payload");
      return NextResponse.json({ success: true });
    }

    console.log(`[VAPI WEBHOOK] Event type: ${type}`);

    switch (type) {
      case "end-of-call-report": {
        await handleEndOfCallReport(message);
        break;
      }
      case "status-update": {
        console.log(`[VAPI WEBHOOK] Call status: ${message.status}`);
        break;
      }
      case "transcript":
      case "hang":
      case "speech-update":
      case "conversation-update":
        break;
      default:
        console.log(`[VAPI WEBHOOK] Unhandled event type: ${type}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[VAPI WEBHOOK] Error processing webhook:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleEndOfCallReport(message: any) {
  const call = message.call || {};
  const artifact = message.artifact || {};
  const analysis = message.analysis || {};

  // Extract phone number - try multiple field paths for compatibility
  const phoneNumber =
    call.customer?.number ||
    call.customer?.phone ||
    call.from?.phoneNumber ||
    call.phoneNumber ||
    call.phone ||
    "unknown";

  // Extract transcript - Vapi puts it in artifact.transcript
  const transcript = artifact.transcript || message.transcript || null;

  // Extract summary - Vapi puts it in analysis.summary.
  // If missing, generate a basic summary from the transcript.
  let summary = analysis.summary || message.summary || null;
  if (!summary && transcript) {
    summary = generateSummaryFromTranscript(transcript);
  }

  // Extract recording URL - Vapi puts it in artifact.recording or artifact.recordingUrl
  const recordingUrl =
    artifact.recordingUrl ||
    artifact.recording?.url ||
    (typeof artifact.recording === "string" ? artifact.recording : null) ||
    message.recordingUrl ||
    null;

  // Extract ended reason
  const endedReason = message.endedReason || null;

  // Extract duration from call object - try multiple Vapi field paths
  // Vapi may send as call.duration (seconds), message.durationSeconds,
  // or we can compute from startedAt/endedAt timestamps
  const rawDuration =
    call.duration ||
    message.durationSeconds ||
    (call.endedAt && call.startedAt
      ? (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000
      : 0);
  const duration = Math.round(rawDuration);
  const cost = call.cost || call.costs?.total || 0;
  const callId = call.id || `unknown-${Date.now()}`;

  console.log("[VAPI WEBHOOK] End-of-call-report parsed:", {
    callId,
    phoneNumber,
    duration,
    rawDurationSource: call.duration ? "call.duration" : message.durationSeconds ? "message.durationSeconds" : (call.endedAt && call.startedAt) ? "timestamps" : "none",
    callStartedAt: call.startedAt,
    callEndedAt: call.endedAt,
    hasSummary: !!summary,
    hasTranscript: !!transcript,
    hasRecording: !!recordingUrl,
    endedReason,
  });

  // Find or create lead by phone number
  let lead = null;
  if (phoneNumber !== "unknown") {
    lead = await prisma.lead.findUnique({
      where: { phone: phoneNumber },
    });

    if (!lead) {
      lead = await prisma.lead.create({
        data: { phone: phoneNumber, source: "phone" },
      });
      console.log(`[VAPI WEBHOOK] Created new lead for ${phoneNumber}`);
    }
  }

  // Basic sentiment from summary
  let sentiment = "neutral";
  const lower = (summary || "").toLowerCase();
  if (
    lower.includes("happy") ||
    lower.includes("satisfied") ||
    lower.includes("thank") ||
    lower.includes("great") ||
    lower.includes("pleased") ||
    lower.includes("helpful")
  ) {
    sentiment = "positive";
  } else if (
    lower.includes("frustrated") ||
    lower.includes("angry") ||
    lower.includes("complaint") ||
    lower.includes("unhappy") ||
    lower.includes("terrible") ||
    lower.includes("disappointed")
  ) {
    sentiment = "negative";
  }

  await prisma.call.create({
    data: {
      vapiCallId: callId,
      phoneNumber,
      status: "completed",
      duration,
      transcript: transcript ? JSON.parse(JSON.stringify(transcript)) : null,
      summary: summary || null,
      sentiment,
      recordingUrl,
      costCents: cost ? Math.round(cost * 100) : null,
      endReason: endedReason,
      leadId: lead?.id || null,
    },
  });

  console.log(
    `[VAPI WEBHOOK] Call saved: ${callId} | Phone: ${phoneNumber} | Duration: ${duration}s`
  );
}
