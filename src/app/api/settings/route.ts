import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    let settings = await prisma.businessSettings.findUnique({
      where: { id: "default" },
    });

    if (!settings) {
      settings = await prisma.businessSettings.create({
        data: {
          id: "default",
          businessName: "DOAI Systems",
          businessDescription: "AI-powered technology solutions for businesses",
          services: [
            { name: "AI Automation", description: "Custom AI solutions for business processes" },
            { name: "CRM Systems", description: "Customer relationship management platforms" },
            { name: "Voice AI", description: "AI-powered call assistants and voice bots" },
          ],
          teamMembers: [
            { name: "Christopher Do", email: "christopher@doaisystems.co.uk", phone: "", role: "admin" },
            { name: "Roy Cheung", email: "roy@doaisystems.co.uk", phone: "", role: "admin" },
            { name: "Joe Delima", email: "joe@doaisystems.co.uk", phone: "", role: "member" },
          ],
          operatingHours: { start: "09:00", end: "17:00", timezone: "Europe/London", days: [1, 2, 3, 4, 5] },
        },
      });
    }

    return NextResponse.json({ settings });
  } catch (error) {
    console.error("[SETTINGS API] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const data = await req.json();

    if (!data || typeof data !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const settings = await prisma.businessSettings.upsert({
      where: { id: "default" },
      update: data,
      create: { id: "default", ...data },
    });

    return NextResponse.json({ settings });
  } catch (error) {
    console.error("[SETTINGS API] PUT error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
