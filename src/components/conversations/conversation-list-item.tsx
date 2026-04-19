import { cn } from "@/lib/utils";
import {
  Star,
  MessageCircle,
  Globe,
  Camera,
  Send,
  type LucideIcon,
} from "lucide-react";

type Channel = "whatsapp" | "website" | "instagram" | "facebook";

interface ConversationListItemProps {
  id: string;
  contactName: string | null;
  phoneNumber: string;
  lastMessage: string | null;
  lastMessageAt: string;
  isRead: boolean;
  starred: boolean;
  isActive: boolean;
  channel?: Channel;
  onClick: () => void;
}

// Per-channel badge metadata. Lucide removed Meta's brand icons in 1.x
// (licensing), so we use evocative generics: Camera for Instagram (the
// app's original camera icon), Send / paper-plane for Messenger.
const CHANNEL_BADGE: Record<
  Channel,
  { icon: LucideIcon; bg: string; label: string }
> = {
  whatsapp: { icon: MessageCircle, bg: "bg-emerald-600", label: "WhatsApp" },
  website: { icon: Globe, bg: "bg-violet-600", label: "Website chat" },
  instagram: { icon: Camera, bg: "bg-pink-600", label: "Instagram" },
  facebook: { icon: Send, bg: "bg-blue-600", label: "Messenger" },
};

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
    "bg-indigo-600",
    "bg-orange-600",
  ];
  return colors[Math.abs(hash) % colors.length];
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export function ConversationListItem({
  contactName,
  phoneNumber,
  lastMessage,
  lastMessageAt,
  isRead,
  starred,
  isActive,
  channel,
  onClick,
}: ConversationListItemProps) {
  const initials = getInitials(contactName, phoneNumber);
  const avatarColor = getAvatarColor(contactName, phoneNumber);
  const badge = channel ? CHANNEL_BADGE[channel] : null;
  const ChannelIcon = badge?.icon;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-3 px-3 py-3 text-left transition-colors border-b border-white/5",
        isActive
          ? "bg-blue-600/15 border-l-2 border-l-blue-500"
          : "hover:bg-white/5"
      )}
    >
      <div className="relative shrink-0">
        <div
          className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-semibold",
            avatarColor
          )}
        >
          {initials}
        </div>
        {badge && ChannelIcon && (
          <div
            className={cn(
              "absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center border border-[#161b22]",
              badge.bg
            )}
            title={badge.label}
          >
            <ChannelIcon className="w-2.5 h-2.5 text-white" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "text-sm truncate",
              !isRead ? "font-semibold text-white" : "font-medium text-slate-300"
            )}
          >
            {contactName || phoneNumber}
          </span>
          <span className="text-[10px] text-slate-500 shrink-0">
            {formatRelativeTime(lastMessageAt)}
          </span>
        </div>

        <div className="flex items-center gap-1.5 mt-0.5">
          {!isRead && (
            <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
          )}
          {starred && (
            <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
          )}
          <p
            className={cn(
              "text-xs truncate",
              !isRead ? "text-slate-300" : "text-slate-500"
            )}
          >
            {lastMessage || "No messages yet"}
          </p>
        </div>
      </div>
    </button>
  );
}
