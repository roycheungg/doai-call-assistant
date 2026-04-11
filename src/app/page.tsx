"use client";

import { useEffect, useState } from "react";
import { StatCard } from "@/components/dashboard/stat-card";
import { RecentCalls } from "@/components/dashboard/recent-calls";
import { CallbacksList } from "@/components/dashboard/callbacks-list";
import { Phone, Users, Clock, PhoneIncoming } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";

interface Stats {
  totalCalls: number;
  callsToday: number;
  callsThisWeek: number;
  callsThisMonth: number;
  totalLeads: number;
  newLeads: number;
  pendingCallbacks: number;
  avgDuration: number;
  recentCalls: Array<{
    id: string;
    phoneNumber: string;
    status: string;
    duration: number;
    summary: string | null;
    sentiment: string | null;
    createdAt: string;
    lead: { name: string | null; company: string | null } | null;
  }>;
  sentimentDistribution: Array<{ sentiment: string; count: number }>;
  callVolume: Array<{ day: string; count: number }>;
}

interface Callback {
  id: string;
  assignedTo: string;
  scheduledAt: string;
  status: string;
  notes: string | null;
  lead: { name: string | null; phone: string; company: string | null };
}

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "#34d399",
  neutral: "#94a3b8",
  negative: "#f87171",
  unknown: "#64748b",
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [callbacks, setCallbacks] = useState<Callback[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [statsRes, callbacksRes] = await Promise.all([
          fetch("/api/stats"),
          fetch("/api/callbacks?status=pending"),
        ]);
        const statsData = await statsRes.json();
        const callbacksData = await callbacksRes.json();
        setStats(statsData);
        setCallbacks(callbacksData.callbacks || []);
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Dashboard</h1>
        <p className="text-slate-500 mt-1">
          Overview of your AI call assistant activity
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Calls Today"
          value={stats?.callsToday || 0}
          subtitle={`${stats?.callsThisWeek || 0} this week`}
          icon={PhoneIncoming}
        />
        <StatCard
          title="Total Calls"
          value={stats?.totalCalls || 0}
          subtitle={`${stats?.callsThisMonth || 0} this month`}
          icon={Phone}
        />
        <StatCard
          title="Leads Captured"
          value={stats?.totalLeads || 0}
          subtitle={`${stats?.newLeads || 0} new this week`}
          icon={Users}
          trend="up"
        />
        <StatCard
          title="Avg Duration"
          value={formatDuration(stats?.avgDuration || 0)}
          subtitle={`${stats?.pendingCallbacks || 0} callbacks pending`}
          icon={Clock}
        />
      </div>

      {/* Charts Row: Sentiment + Call Volume */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sentiment Distribution */}
        <div className="rounded-xl border border-white/10 bg-[#161b22] p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Sentiment Distribution</h3>
          {stats?.sentimentDistribution && stats.sentimentDistribution.length > 0 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.sentimentDistribution}
                    dataKey="count"
                    nameKey="sentiment"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={2}
                    label={({ name, value }) => `${name} (${value})`}
                  >
                    {stats.sentimentDistribution.map((entry) => (
                      <Cell
                        key={entry.sentiment}
                        fill={SENTIMENT_COLORS[entry.sentiment] || "#64748b"}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0d1117", borderColor: "rgba(255,255,255,0.1)" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-slate-500 text-center py-12">No call data yet</p>
          )}
        </div>

        {/* Call Volume (last 30 days) */}
        <div className="lg:col-span-2 rounded-xl border border-white/10 bg-[#161b22] p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Call Volume (Last 30 Days)</h3>
          {stats?.callVolume && stats.callVolume.length > 0 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.callVolume}>
                  <XAxis
                    dataKey="day"
                    tickFormatter={(d) => {
                      try { return format(new Date(d), "MMM d"); } catch { return d; }
                    }}
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    interval="preserveStartEnd"
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0d1117", borderColor: "rgba(255,255,255,0.1)" }}
                    labelFormatter={(d) => {
                      try { return format(new Date(d), "MMM d, yyyy"); } catch { return d; }
                    }}
                    formatter={(value) => [value, "Calls"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#60a5fa"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: "#60a5fa" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-slate-500 text-center py-12">No call data yet</p>
          )}
        </div>
      </div>

      {/* Recent Calls + Callbacks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentCalls calls={stats?.recentCalls || []} />
        </div>
        <div>
          <CallbacksList callbacks={callbacks} />
        </div>
      </div>
    </div>
  );
}
