"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Save, Plus, Trash2, Building2, Users } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";

interface TeamMember {
  name: string;
  email: string;
  phone: string;
  role: string;
}

interface Settings {
  businessName: string;
  teamMembers: TeamMember[];
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await apiFetch("/api/settings");
        const data = await res.json();
        setSettings({
          businessName: data.settings?.businessName || "",
          teamMembers: data.settings?.teamMembers || [],
        });
      } catch (error) {
        console.error("Failed to fetch settings:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();
  }, []);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    try {
      await apiFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
    } catch (error) {
      console.error("Failed to save settings:", error);
    } finally {
      setSaving(false);
    }
  }

  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground mt-1">
            Your organization profile
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {/* Business Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Business Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Business Name</label>
            <Input
              value={settings.businessName}
              onChange={(e) =>
                setSettings({ ...settings, businessName: e.target.value })
              }
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Team Members */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="w-5 h-5" />
            Team Members
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {settings.teamMembers.map((member, i) => (
            <div
              key={i}
              className="flex gap-3 items-start p-3 border rounded-lg"
            >
              <div className="flex-1 grid grid-cols-2 gap-2">
                <Input
                  value={member.name}
                  onChange={(e) => {
                    const updated = [...settings.teamMembers];
                    updated[i] = { ...updated[i], name: e.target.value };
                    setSettings({ ...settings, teamMembers: updated });
                  }}
                  placeholder="Name"
                />
                <Input
                  value={member.email}
                  onChange={(e) => {
                    const updated = [...settings.teamMembers];
                    updated[i] = { ...updated[i], email: e.target.value };
                    setSettings({ ...settings, teamMembers: updated });
                  }}
                  placeholder="Email"
                />
                <Input
                  value={member.phone}
                  onChange={(e) => {
                    const updated = [...settings.teamMembers];
                    updated[i] = { ...updated[i], phone: e.target.value };
                    setSettings({ ...settings, teamMembers: updated });
                  }}
                  placeholder="Phone number"
                />
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{member.role}</Badge>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSettings({
                    ...settings,
                    teamMembers: settings.teamMembers.filter(
                      (_, idx) => idx !== i
                    ),
                  });
                }}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setSettings({
                ...settings,
                teamMembers: [
                  ...settings.teamMembers,
                  { name: "", email: "", phone: "", role: "member" },
                ],
              })
            }
          >
            <Plus className="w-4 h-4 mr-1" /> Add Team Member
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            Team members&apos; phone numbers are used by the voice agent when a
            caller asks to be transferred to a human.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
