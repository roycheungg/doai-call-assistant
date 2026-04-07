import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalCalls,
      callsToday,
      callsThisWeek,
      callsThisMonth,
      totalLeads,
      newLeads,
      pendingCallbacks,
      avgDuration,
      recentCalls,
    ] = await Promise.all([
      prisma.call.count(),
      prisma.call.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.call.count({ where: { createdAt: { gte: weekStart } } }),
      prisma.call.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.lead.count(),
      prisma.lead.count({ where: { createdAt: { gte: weekStart } } }),
      prisma.callback.count({ where: { status: "pending" } }),
      prisma.call.aggregate({ _avg: { duration: true } }),
      prisma.call.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        include: { lead: true },
      }),
    ]);

    return NextResponse.json({
      totalCalls,
      callsToday,
      callsThisWeek,
      callsThisMonth,
      totalLeads,
      newLeads,
      pendingCallbacks,
      avgDuration: Math.round(avgDuration._avg.duration || 0),
      recentCalls,
    });
  } catch (error) {
    console.error("[STATS API] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
