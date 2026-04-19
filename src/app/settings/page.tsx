"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Save,
  Plus,
  Trash2,
  Building2,
  Users,
  MessageSquare,
  MessageCircle,
  Phone,
} from "lucide-react";
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
  chatbotEnabled: boolean;
  whatsappEnabled: boolean;
  voiceEnabled: boolean;
}

interface PhoneNumber {
  id: string;
  number: string;
  channel: "vapi" | "whatsapp";
  label: string | null;
  active: boolean;
  createdAt: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [whatsappNumbers, setWhatsappNumbers] = useState<PhoneNumber[]>([]);
  const [voiceNumbers, setVoiceNumbers] = useState<PhoneNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchAll() {
      try {
        const res = await apiFetch("/api/settings");
        const data = await res.json();
        const s: Settings = {
          businessName: data.settings?.businessName || "",
          teamMembers: data.settings?.teamMembers || [],
          chatbotEnabled: !!data.settings?.chatbotEnabled,
          whatsappEnabled: !!data.settings?.whatsappEnabled,
          voiceEnabled: !!data.settings?.voiceEnabled,
        };
        setSettings(s);

        // Parallel phone-number fetches (only for enabled features)
        const fetches: Promise<void>[] = [];
        if (s.whatsappEnabled) {
          fetches.push(
            apiFetch("/api/phone-numbers?channel=whatsapp")
              .then((r) => r.json())
              .then((d) => setWhatsappNumbers(d.phoneNumbers || []))
              .catch(() => setWhatsappNumbers([]))
          );
        }
        if (s.voiceEnabled) {
          fetches.push(
            apiFetch("/api/phone-numbers?channel=vapi")
              .then((r) => r.json())
              .then((d) => setVoiceNumbers(d.phoneNumbers || []))
              .catch(() => setVoiceNumbers([]))
          );
        }
        await Promise.allSettled(fetches);
      } catch (error) {
        console.error("Failed to fetch settings:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    try {
      // Only send the fields the settings page actually edits. The API
      // strips super-admin-only fields anyway, but being explicit here
      // avoids round-tripping stale flag state.
      await apiFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: settings.businessName,
          teamMembers: settings.teamMembers,
        }),
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
            Your organization profile and enabled features
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {/* Business Info — always visible */}
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

      {/* Website Chatbot — badge only */}
      {settings.chatbotEnabled && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Website Chatbot
              </span>
              <Badge variant="default">Enabled</Badge>
            </CardTitle>
          </CardHeader>
        </Card>
      )}

      {/* WhatsApp — badge + number(s) */}
      {settings.whatsappEnabled && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5" />
                WhatsApp
              </span>
              <Badge variant="default">Enabled</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {whatsappNumbers.length > 0 ? (
              <ul className="space-y-1">
                {whatsappNumbers.map((p) => (
                  <li
                    key={p.id}
                    className="text-sm font-mono flex items-center gap-2"
                  >
                    <span>{p.number}</span>
                    {p.label && (
                      <span className="text-xs text-muted-foreground font-sans">
                        — {p.label}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No phone number assigned yet — contact DOAI.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Voice Agent — badge + number(s) */}
      {settings.voiceEnabled && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Phone className="w-5 h-5" />
                Voice Agent
              </span>
              <Badge variant="default">Enabled</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {voiceNumbers.length > 0 ? (
              <ul className="space-y-1">
                {voiceNumbers.map((p) => (
                  <li
                    key={p.id}
                    className="text-sm font-mono flex items-center gap-2"
                  >
                    <span>{p.number}</span>
                    {p.label && (
                      <span className="text-xs text-muted-foreground font-sans">
                        — {p.label}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No phone number assigned yet — contact DOAI.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Team Members — only if voice is enabled */}
      {settings.voiceEnabled && (
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
              Used by the voice agent when a caller asks to speak to a human.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
