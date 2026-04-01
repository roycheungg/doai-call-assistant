import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bookCallback, getAvailableSlots } from "@/lib/calendar";

// Vapi calls this endpoint when the AI assistant invokes a tool/function
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message } = body;

    if (message.type !== "function-call") {
      return NextResponse.json({ success: true });
    }

    const { functionCall } = message;
    const { name, parameters } = functionCall;

    let result: unknown;

    switch (name) {
      case "save_customer_details":
        result = await handleSaveCustomerDetails(parameters);
        break;
      case "book_callback":
        result = await handleBookCallback(parameters);
        break;
      case "check_availability":
        result = await handleCheckAvailability(parameters);
        break;
      case "transfer_call":
        result = await handleTransferCall(parameters);
        break;
      default:
        result = { error: `Unknown function: ${name}` };
    }

    return NextResponse.json({ result });
  } catch (error) {
    console.error("Function call error:", error);
    return NextResponse.json(
      { result: { error: "Function execution failed" } },
      { status: 200 }
    );
  }
}

async function handleSaveCustomerDetails(params: {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  issue?: string;
}) {
  const { name, email, phone, company, issue } = params;

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
      issue: issue || null,
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
