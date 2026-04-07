import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
    const body = await req.json();

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

  // Extract summary - Vapi puts it in analysis.summary
  const summary = analysis.summary || message.summary || null;

  // Extract recording URL - Vapi puts it in artifact.recording or artifact.recordingUrl
  const recordingUrl =
    artifact.recordingUrl ||
    artifact.recording?.url ||
    (typeof artifact.recording === "string" ? artifact.recording : null) ||
    message.recordingUrl ||
    null;

  // Extract ended reason
  const endedReason = message.endedReason || null;

  // Extract duration and cost from call object
  const duration = call.duration || 0;
  const cost = call.cost || call.costs?.total || 0;
  const callId = call.id || `unknown-${Date.now()}`;

  console.log("[VAPI WEBHOOK] End-of-call-report parsed:", {
    callId,
    phoneNumber,
    duration,
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
