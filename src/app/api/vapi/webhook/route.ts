import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Vapi sends webhook events for call lifecycle
// Docs: https://docs.vapi.ai/server-url
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message } = body;

    switch (message.type) {
      case "end-of-call-report": {
        await handleEndOfCallReport(message);
        break;
      }
      case "status-update": {
        console.log(`Call status: ${message.status}`);
        break;
      }
      case "transcript":
      case "hang":
        break;
      default:
        console.log(`Unhandled webhook type: ${message.type}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

async function handleEndOfCallReport(message: Record<string, unknown>) {
  const {
    call,
    transcript,
    summary,
    recordingUrl,
    endedReason,
  } = message as {
    call: { id: string; customer?: { number?: string }; duration?: number; cost?: number };
    transcript: string;
    summary: string;
    recordingUrl?: string;
    endedReason?: string;
  };

  const phoneNumber = call.customer?.number || "unknown";

  // Find or create lead by phone number
  let lead = await prisma.lead.findUnique({
    where: { phone: phoneNumber },
  });

  if (!lead && phoneNumber !== "unknown") {
    lead = await prisma.lead.create({
      data: { phone: phoneNumber, source: "phone" },
    });
  }

  // Basic sentiment from summary
  let sentiment = "neutral";
  const lower = (summary || "").toLowerCase();
  if (lower.includes("happy") || lower.includes("satisfied") || lower.includes("thank")) {
    sentiment = "positive";
  } else if (lower.includes("frustrated") || lower.includes("angry") || lower.includes("complaint")) {
    sentiment = "negative";
  }

  await prisma.call.create({
    data: {
      vapiCallId: call.id,
      phoneNumber,
      status: "completed",
      duration: call.duration || 0,
      transcript: transcript ? JSON.parse(JSON.stringify(transcript)) : null,
      summary: summary || null,
      sentiment,
      recordingUrl: recordingUrl || null,
      costCents: call.cost ? Math.round(call.cost * 100) : null,
      endReason: endedReason || null,
      leadId: lead?.id || null,
    },
  });
}
