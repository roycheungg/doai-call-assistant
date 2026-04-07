import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bookCallback, getAvailableSlots } from "@/lib/calendar";

// Vapi calls this endpoint when the AI assistant invokes a tool/function
// Supports both:
// 1. Server URL webhook format: { message: { type: "function-call", functionCall: { name, parameters } } }
// 2. API Request tool format: { message: { toolCallList: [{ function: { name, arguments } }] } }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Log the raw payload for debugging
    console.log("[VAPI] Received payload:", JSON.stringify(body, null, 2));

    let name: string | undefined;
    let parameters: Record<string, unknown> = {};
    let toolCallId: string | undefined;

    // Format 1: Server URL webhook (function-call type)
    if (body.message?.type === "function-call") {
      name = body.message.functionCall?.name;
      parameters = body.message.functionCall?.parameters || {};
      toolCallId = body.message.functionCall?.id;
    }
    // Format 2: API Request tool with toolCallList
    else if (body.message?.toolCallList) {
      const toolCall = body.message.toolCallList[0];
      name = toolCall?.function?.name;
      toolCallId = toolCall?.id;
      try {
        parameters = typeof toolCall?.function?.arguments === "string"
          ? JSON.parse(toolCall.function.arguments)
          : toolCall?.function?.arguments || {};
      } catch {
        parameters = {};
      }
    }
    // Format 3: API Request tool - direct tool call
    else if (body.message?.type === "tool-calls") {
      const toolCall = body.message.toolCallList?.[0] || body.message.toolCalls?.[0];
      name = toolCall?.function?.name;
      toolCallId = toolCall?.id;
      try {
        parameters = typeof toolCall?.function?.arguments === "string"
          ? JSON.parse(toolCall.function.arguments)
          : toolCall?.function?.arguments || {};
      } catch {
        parameters = {};
      }
    }
    // Format 4: Direct parameters (some API Request tool configs)
    else if (body.name || body.phone || body.date) {
      if (body.phone && !body.date) {
        name = "save_customer_details";
        parameters = body;
      } else if (body.date && body.customerPhone) {
        name = "book_callback";
        parameters = body;
      } else if (body.date) {
        name = "check_availability";
        parameters = body;
      }
    }
    // Format 5: Wrapped in a "tool_call" key
    else if (body.tool_call) {
      name = body.tool_call.name || body.tool_call.function?.name;
      toolCallId = body.tool_call.id;
      parameters = body.tool_call.parameters || body.tool_call.function?.arguments || {};
      if (typeof parameters === "string") {
        try { parameters = JSON.parse(parameters); } catch { parameters = {}; }
      }
    }

    if (!name) {
      console.log("[VAPI] Could not determine function name from payload");
      return NextResponse.json(
        { results: [{ result: JSON.stringify({ error: "Could not determine function name" }) }] },
        { status: 400 }
      );
    }

    console.log(`[VAPI] Executing function: ${name} with params:`, JSON.stringify(parameters));

    let result: unknown;

    switch (name) {
      case "save_customer_details":
        result = await handleSaveCustomerDetails(parameters as {
          name?: string; email?: string; phone?: string;
          company?: string; businessType?: string; issue?: string;
        });
        break;
      case "book_callback":
        result = await handleBookCallback(parameters as {
          date: string; time?: string; assignedTo?: string;
          notes?: string; customerPhone: string; customerName?: string;
        });
        break;
      case "check_availability":
        result = await handleCheckAvailability(parameters as {
          date: string; teamMember?: string;
        });
        break;
      case "transfer_call":
        result = await handleTransferCall(parameters as {
          teamMember?: string; reason?: string;
        });
        break;
      default:
        result = { error: `Unknown function: ${name}` };
    }

    console.log(`[VAPI] Function ${name} result:`, JSON.stringify(result));

    // Vapi expects results with toolCallId for matching
    const responseItem: { toolCallId?: string; result: string } = {
      result: JSON.stringify(result),
    };
    if (toolCallId) {
      responseItem.toolCallId = toolCallId;
    }

    return NextResponse.json({ results: [responseItem] });
  } catch (error) {
    console.error("[VAPI] Function call error:", error);
    return NextResponse.json(
      { results: [{ result: JSON.stringify({ error: "Function execution failed" }) }] },
      { status: 200 }
    );
  }
}

async function handleSaveCustomerDetails(params: {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  businessType?: string;
  issue?: string;
}) {
  const { name, email, phone, company, businessType, issue } = params;

  if (!phone) {
    return { success: false, message: "Phone number is required" };
  }

  const lead = await prisma.lead.upsert({
    where: { phone },
    update: {
      ...(name && { name }),
      ...(email && { email }),
      ...(company && { company }),
      ...(issue && { issue }),
    },
    create: {
      phone,
      name: name || null,
      email: email || null,
      company: company || null,
      issue: businessType ? `[${businessType}] ${issue || ""}`.trim() : issue || null,
      source: "phone",
    },
  });

  return {
    success: true,
    message: `Customer details saved for ${lead.name || lead.phone}`,
    leadId: lead.id,
  };
}

async function handleBookCallback(params: {
  date: string;
  time?: string;
  assignedTo?: string;
  notes?: string;
  customerPhone: string;
  customerName?: string;
}) {
  const { date, time, assignedTo, notes, customerPhone, customerName } = params;

  let lead = await prisma.lead.findUnique({ where: { phone: customerPhone } });

  if (!lead) {
    lead = await prisma.lead.create({
      data: { phone: customerPhone, name: customerName || null, source: "phone" },
    });
  }

  const scheduledAt = time ? new Date(`${date}T${time}`) : new Date(date);

  let teamMember = assignedTo;
  if (!teamMember) {
    const settings = await prisma.businessSettings.findUnique({ where: { id: "default" } });
    const members = (settings?.teamMembers as Array<{ name: string }>) || [];
    teamMember = members[0]?.name || "Team";
  }

  const booking = await bookCallback(
    scheduledAt.toISOString(),
    lead.name || lead.phone,
    lead.phone,
    teamMember,
    notes
  );

  if (!booking.success) {
    return { success: false, message: booking.error || "Failed to book callback" };
  }

  await prisma.callback.create({
    data: {
      leadId: lead.id,
      assignedTo: teamMember,
      scheduledAt,
      notes: notes || null,
      calendarEventId: booking.eventId || null,
    },
  });

  await prisma.lead.update({
    where: { id: lead.id },
    data: { status: "callback_booked" },
  });

  return {
    success: true,
    message: `Callback booked for ${scheduledAt.toLocaleString()} with ${teamMember}`,
    scheduledAt: scheduledAt.toISOString(),
  };
}

async function handleCheckAvailability(params: { date: string; teamMember?: string }) {
  const slots = await getAvailableSlots(params.date, params.teamMember);
  const available = slots.filter((s) => s.available);

  if (available.length === 0) {
    return {
      available: false,
      message: "No available slots on that date. Would you like to try another day?",
    };
  }

  const formatted = available.slice(0, 6).map((s) => {
    const d = new Date(s.start);
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  });

  return {
    available: true,
    slots: formatted,
    message: `Available times: ${formatted.join(", ")}`,
  };
}

async function handleTransferCall(params: { teamMember?: string; reason?: string }) {
  const settings = await prisma.businessSettings.findUnique({ where: { id: "default" } });
  const members = (settings?.teamMembers as Array<{ name: string; phone: string }>) || [];

  const member = params.teamMember
    ? members.find((m) => m.name.toLowerCase().includes(params.teamMember!.toLowerCase()))
    : members[0];

  if (!member?.phone) {
    return {
      success: false,
      message: "No team member available for transfer. Would you like to book a callback instead?",
    };
  }

  return {
    success: true,
    destination: {
      type: "number",
      number: member.phone,
      message: `Transferring you to ${member.name} now.`,
    },
  };
}
