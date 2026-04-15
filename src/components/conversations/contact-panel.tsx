import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Star, Phone, Mail, Building2, Calendar, MessageCircle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface ContactPanelProps {
  conversation: {
    id: string;
    phoneNumber: string;
    contactName: string | null;
    status: string;
    starred: boolean;
    createdAt: string;
    lead: {
      id: string;
      name: string | null;
      email: string | null;
      phone: string;
      company: string | null;
      status: string;
      source: string;
    } | null;
  };
  onToggleStar: () => void;
}

function getInitials(name: string | null, phone: string): string {
  if (name) {
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return phone.slice(-2);
}

function getAvatarColor(name: string | null, phone: string): string {
  const str = name || phone;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    "bg-blue-600",
    "bg-emerald-600",
    "bg-purple-600",
    "bg-amber-600",
    "bg-rose-600",
    "bg-cyan-600",
  ];
  return colors[Math.abs(hash) % colors.length];
}

export function ContactPanel({ conversation, onToggleStar }: ContactPanelProps) {
  const displayName =
    conversation.contactName ||
    conversation.lead?.name ||
    conversation.phoneNumber;
  const initials = getInitials(
    conversation.contactName || conversation.lead?.name || null,
    conversation.phoneNumber
  );
  const avatarColor = getAvatarColor(
    conversation.contactName,
    conversation.phoneNumber
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 flex flex-col items-center text-center border-b border-white/10">
        <div
          className={cn(
            "w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-semibold mb-3",
            avatarColor
          )}
        >
          {initials}
        </div>
        <h3 className="font-semibold text-white">{displayName}</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          {conversation.phoneNumber}
        </p>

        <div className="flex items-center gap-2 mt-3">
          <Badge
            variant={
              conversation.status === "active" ? "default" : "secondary"
            }
            className="text-[10px]"
          >
            {conversation.status}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onToggleStar}
          >
            <Star
              className={cn(
                "w-4 h-4",
                conversation.starred
                  ? "text-amber-500 fill-amber-500"
                  : "text-slate-500"
              )}
            />
          </Button>
        </div>
      </div>

      {/* Details */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
            Contact
          </h4>
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5 text-sm">
              <Phone className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-slate-300">{conversation.phoneNumber}</span>
            </div>
            {conversation.lead?.email && (
              <div className="flex items-center gap-2.5 text-sm">
                <Mail className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-slate-300">
                  {conversation.lead.email}
                </span>
              </div>
            )}
            {conversation.lead?.company && (
              <div className="flex items-center gap-2.5 text-sm">
                <Building2 className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-slate-300">
                  {conversation.lead.company}
                </span>
              </div>
            )}
          </div>
        </div>

        <Separator className="bg-white/10" />

        {conversation.lead && (
          <div>
            <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
              Lead Info
            </h4>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Status</span>
                <Badge variant="outline" className="text-[10px]">
                  {conversation.lead.status}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Source</span>
                <span className="text-slate-300 flex items-center gap-1.5">
                  <MessageCircle className="w-3 h-3" />
                  {conversation.lead.source}
                </span>
              </div>
            </div>
          </div>
        )}

        <Separator className="bg-white/10" />

        <div>
          <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
            Activity
          </h4>
          <div className="flex items-center gap-2.5 text-sm">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-slate-300">
              Joined {format(new Date(conversation.createdAt), "MMM d, yyyy")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
