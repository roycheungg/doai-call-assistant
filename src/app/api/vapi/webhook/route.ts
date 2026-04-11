import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createHmac } from "crypto";

const WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET;

/**
 * Parse a Vapi transcript into a flat text string for analysis.
 * Vapi sends transcripts in two possible formats:
 *   1. A plain string like "AI: Hello\nUser: Hi"
 *   2. A JSON array of {role, message/text/content} objects
 * This function normalises both into a single string.
 */
function transcriptToText(transcript: unknown): string {
  if (typeof transcript === "string") return transcript;
  if (Array.isArray(transcript)) {
    return transcript
      .map((m: Record<string, unknown>) => {
        const role = String(m.role || "unknown");
        const text = String(m.message || m.text || m.content || "");
        return `${role}: ${text}`;
      })
      .join("\n");
  }
  return "";
}

/**
 * Extract user/customer lines from a transcript text string.
 * Works with both "User: ..." prefix format and JSON array format.
 */
function extractCustomerMessages(transcriptText: string): string[] {
  return transcriptText
    .split("\n")
    .filter((line) => /^(user|customer):/i.test(line.trim()))
    .map((line) => line.replace(/^(user|customer):\s*/i, "").trim())
    .filter((msg) => msg.length > 0);
}

/**
 * Generate a basic summary from the transcript when Vapi doesn't provide one.
 * Handles both string and JSON-array transcript formats.
 */
function generateSummaryFromTranscript(transcript: unknown): string | null {
  try {
    const text = transcriptToText(transcript);
    if (!text || text.length < 10) return null;

    const customerMessages = extractCustomerMessages(text);
    const lines = text.split("\n").filter(Boolean);

    const parts: string[] = [];
    parts.push(`Call with ${lines.length} exchanges.`);

    // Take the first meaningful customer message as the topic
    const firstMsg = customerMessages[0];
    if (firstMsg && firstMsg.length > 10) {
      parts.push(`Customer discussed: "${firstMsg.slice(0, 100)}${firstMsg.length > 100 ? "..." : ""}"`);
    }

    // Check for callback/booking/transfer mentions
    const lower = text.toLowerCase();
    if (lower.includes("callback") || lower.includes("call back") || lower.includes("call you back")) {
      parts.push("Callback was discussed.");
    }
    if (lower.includes("book") || lower.includes("appointment") || lower.includes("schedule")) {
      parts.push("Booking/appointment was discussed.");
    }
    if (lower.includes("transfer") || lower.includes("speak to someone")) {
      parts.push("Transfer was requested.");
    }

    return parts.join(" ");
  } catch {
    return null;
  }
}

/**
 * Derive sentiment from the full transcript text + summary.
 * Checks both sources so sentiment works even when summary is null.
 */
function deriveSentiment(summary: string | null, transcript: unknown): string {
  const text = ((summary || "") + " " + transcriptToText(transcript)).toLowerCase();
  const positiveWords = ["happy", "satisfied", "thank", "great", "pleased", "helpful", "perfect", "excellent", "appreciate", "wonderful"];
  const negativeWords = ["frustrated", "angry", "complaint", "unhappy", "terrible", "disappointed", "awful", "horrible", "waste", "useless"];

  if (positiveWords.some((w) => text.includes(w))) return "positive";
  if (negativeWords.some((w) => text.includes(w))) return "negative";
  return "neutral";
}

/**
 * Try to extract the caller's name from the transcript text.
 * Looks for patterns like "my name is X", "I'm X", "this is X calling".
 */
function extractCallerName(transcript: unknown): string | null {
  const text = transcriptToText(transcript);
  if (!text) return null;

  // Only check user/customer lines
  const customerText = extractCustomerMessages(text).join(" ");
  if (!customerText) return null;

  const patterns = [
    /my name is (\w+(?:\s\w+)?)/i,
    /(?:i'm|i am) (\w+(?:\s\w+)?)/i,
    /this is (\w+(?:\s\w+)?) (?:calling|speaking|here)/i,
    /(?:^|\. )(\w+) (?:here|speaking)/i,
  ];

  for (const pattern of patterns) {
    const match = customerText.match(pattern);
    if (match?.[1]) {
      const name = match[1].trim();
      // Filter out common false positives
      const falsePositives = ["calling", "looking", "wondering", "interested", "having", "trying", "running", "just", "not", "very", "really", "also", "based"];
      if (name.length > 1 && !falsePositives.includes(name.toLowerCase())) {
        return name;
      }
    }
  }

  return null;
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

  // Derive sentiment from both summary and transcript
  const sentiment = deriveSentiment(summary, transcript);

  // Try to extract caller name from transcript
  const callerName = extractCallerName(transcript);

  // Find or create lead by phone number
  let lead = null;
  if (phoneNumber !== "unknown") {
    lead = await prisma.lead.findUnique({
      where: { phone: phoneNumber },
    });

    if (!lead) {
      lead = await prisma.lead.create({
        data: {
          phone: phoneNumber,
          source: "phone",
          ...(callerName ? { name: callerName } : {}),
        },
      });
      console.log(`[VAPI WEBHOOK] Created new lead for ${phoneNumber}${callerName ? ` (${callerName})` : ""}`);
    } else if (callerName && !lead.name) {
      // Update existing lead with the extracted name if it doesn't have one
      lead = await prisma.lead.update({
        where: { id: lead.id },
        data: { name: callerName },
      });
      console.log(`[VAPI WEBHOOK] Updated lead name to ${callerName}`);
    }
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
