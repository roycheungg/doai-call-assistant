"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Save, Plus, Trash2, Building2, Users, Clock } from "lucide-react";

interface TeamMember {
  name: string;
  email: string;
  phone: string;
  role: string;
}

interface Service {
  name: string;
  description: string;
}

interface Settings {
  businessName: string;
  businessDescription: string;
  services: Service[];
  teamMembers: TeamMember[];
  operatingHours: { start: string; end: string; timezone: string; days: number[] };
  greetingMessage: string | null;
  vapiAssistantId: string | null;
  vapiPhoneNumberId: string | null;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch("/api/settings");
        const data = await res.json();
        setSettings(data.settings);
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
      await fetch("/api/settings", {
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
            Configure your AI call assistant
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
              onChange={(e) => setSettings({ ...settings, businessName: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Business Description</label>
            <Textarea
              value={settings.businessDescription}
              onChange={(e) => setSettings({ ...settings, businessDescription: e.target.value })}
              className="mt-1"
              rows={3}
              placeholder="Describe what your business does. The AI will use this to explain your services to callers."
            />
          </div>
          <div>
            <label className="text-sm font-medium">Greeting Message</label>
            <Input
              value={settings.greetingMessage || ""}
              onChange={(e) => setSettings({ ...settings, greetingMessage: e.target.value })}
              className="mt-1"
              placeholder="Hello, thank you for calling [Business Name]! How can I help you today?"
            />
          </div>
        </CardContent>
      </Card>

      {/* Services */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Services</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {settings.services.map((service, i) => (
            <div key={i} className="flex gap-3 items-start">
              <div className="flex-1 space-y-2">
                <Input
                  value={service.name}
                  onChange={(e) => {
                    const updated = [...settings.services];
                    updated[i] = { ...updated[i], name: e.target.value };
                    setSettings({ ...settings, services: updated });
                  }}
                  placeholder="Service name"
                />
                <Input
                  value={service.description}
                  onChange={(e) => {
                    const updated = [...settings.services];
                    updated[i] = { ...updated[i], description: e.target.value };
                    setSettings({ ...settings, services: updated });
                  }}
                  placeholder="Brief description"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-1"
                onClick={() => {
                  setSettings({
                    ...settings,
                    services: settings.services.filter((_, idx) => idx !== i),
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
                services: [...settings.services, { name: "", description: "" }],
              })
            }
          >
            <Plus className="w-4 h-4 mr-1" /> Add Service
          </Button>
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
            <div key={i} className="flex gap-3 items-start p-3 border rounded-lg">
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
                    teamMembers: settings.teamMembers.filter((_, idx) => idx !== i),
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
        </CardContent>
      </Card>

      {/* Operating Hours */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Operating Hours
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Start Time</label>
              <Input
                type="time"
                value={settings.operatingHours.start}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    operatingHours: { ...settings.operatingHours, start: e.target.value },
                  })
                }
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">End Time</label>
              <Input
                type="time"
                value={settings.operatingHours.end}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    operatingHours: { ...settings.operatingHours, end: e.target.value },
                  })
                }
                className="mt-1"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            The AI assistant answers calls 24/7, but uses these hours to know when team members are available for transfers.
          </p>
        </CardContent>
      </Card>

      {/* Vapi Config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Vapi Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Assistant ID</label>
            <Input
              value={settings.vapiAssistantId || ""}
              onChange={(e) => setSettings({ ...settings, vapiAssistantId: e.target.value })}
              className="mt-1"
              placeholder="Enter your Vapi assistant ID"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Phone Number ID</label>
            <Input
              value={settings.vapiPhoneNumberId || ""}
              onChange={(e) => setSettings({ ...settings, vapiPhoneNumberId: e.target.value })}
              className="mt-1"
              placeholder="Enter your Vapi phone number ID"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Get these from your Vapi dashboard after creating an assistant and provisioning a phone number.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
