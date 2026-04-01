"use client";

import { useEffect, useState } from "react";
import { StatCard } from "@/components/dashboard/stat-card";
import { RecentCalls } from "@/components/dashboard/recent-calls";
import { CallbacksList } from "@/components/dashboard/callbacks-list";
import { Phone, Users, Clock, PhoneIncoming } from "lucide-react";

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
}

interface Callback {
  id: string;
  assignedTo: string;
  scheduledAt: string;
  status: string;
  notes: string | null;
  lead: { name: string | null; phone: string; company: string | null };
}

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
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Overview of your AI call assistant activity
        </p>
      </div>

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
