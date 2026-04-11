import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

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
      sentimentCounts,
      callVolumeRaw,
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
      // Sentiment distribution
      prisma.call.groupBy({
        by: ["sentiment"],
        _count: { _all: true },
      }),
      // Call volume last 30 days (raw SQL for DATE grouping)
      prisma.$queryRaw<{ day: string; count: number }[]>`
        SELECT DATE("createdAt")::text as day, COUNT(*)::int as count
        FROM ca_calls
        WHERE "createdAt" > ${thirtyDaysAgo}
        GROUP BY DATE("createdAt")
        ORDER BY day
      `,
    ]);

    // Sentiment distribution
    const sentimentDistribution = sentimentCounts.map((s) => ({
      sentiment: s.sentiment || "unknown",
      count: s._count._all,
    }));

    // Call volume per day (last 30 days)
    const callVolume = (callVolumeRaw || []).map((r) => ({
      day: r.day,
      count: Number(r.count),
    }));

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
      sentimentDistribution,
      callVolume,
    });
  } catch (error) {
    console.error("[STATS API] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
