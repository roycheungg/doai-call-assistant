import Image from "next/image";
import { cn } from "@/lib/utils";
import { Star } from "lucide-react";
import {
  CHANNEL_META,
  avatarColorFor,
  initialsFor,
  type Channel as SharedChannel,
} from "@/lib/channels";

// The conversation list only ever shows non-phone channels.
type Channel = Exclude<SharedChannel, "phone">;

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
  /** Profile-pic URL fetched from Graph API (IG/FB only). */
  profilePicUrl?: string | null;
  /** IG @username (no FB equivalent). */
  handle?: string | null;
  onClick: () => void;
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
  profilePicUrl,
  handle,
  onClick,
}: ConversationListItemProps) {
  const initials = initialsFor(contactName, phoneNumber);
  const avatarColor = avatarColorFor(contactName || phoneNumber);
  const badge = channel ? CHANNEL_META[channel] : null;
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
        {profilePicUrl ? (
          <Image
            src={profilePicUrl}
            alt={contactName || ""}
            width={40}
            height={40}
            className="w-10 h-10 rounded-full object-cover"
            unoptimized
          />
        ) : (
          <div
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-semibold",
              avatarColor
            )}
          >
            {initials}
          </div>
        )}
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

        {handle && (
          <div className="text-[11px] text-slate-500 truncate -mt-0.5">
            @{handle}
          </div>
        )}

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
