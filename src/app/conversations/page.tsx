"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MessageCircle, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConversationListItem } from "@/components/conversations/conversation-list-item";
import { ContactPanel } from "@/components/conversations/contact-panel";
import { MessageBubble } from "@/components/conversations/message-bubble";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: string;
  createdAt: string;
}

interface ConversationSummary {
  id: string;
  waId: string;
  phoneNumber: string;
  contactName: string | null;
  status: string;
  isRead: boolean;
  starred: boolean;
  lastMessageAt: string;
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
  _count: { messages: number };
  messages: Array<{ content: string; role: string; createdAt: string }>;
}

interface ConversationDetail extends Omit<ConversationSummary, "messages" | "_count"> {
  messages: Message[];
}

type Filter = "all" | "unread" | "recent" | "starred";

const FILTER_TABS: { value: Filter; label: string }[] = [
  { value: "unread", label: "Unread" },
  { value: "recent", label: "Recent" },
  { value: "starred", label: "Starred" },
  { value: "all", label: "All" },
];

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversation, setActiveConversation] =
    useState<ConversationDetail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch conversation list
  const fetchConversations = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("filter", filter);
      if (search) params.set("search", search);
      const res = await fetch(`/api/conversations?${params}`);
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch (error) {
      console.error("Failed to fetch conversations:", error);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Fetch single conversation detail
  async function selectConversation(id: string) {
    setSelectedId(id);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (!res.ok) throw new Error("Not found");
      const data: ConversationDetail = await res.json();
      setActiveConversation(data);

      // Mark as read
      if (!data.isRead) {
        fetch(`/api/conversations/${id}/read`, { method: "PATCH" });
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, isRead: true } : c))
        );
      }
    } catch (error) {
      console.error("Failed to fetch conversation:", error);
    } finally {
      setLoadingDetail(false);
    }
  }

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConversation?.messages]);

  // Toggle star
  async function toggleStar() {
    if (!activeConversation) return;
    const res = await fetch(
      `/api/conversations/${activeConversation.id}/star`,
      { method: "PATCH" }
    );
    if (res.ok) {
      const data = await res.json();
      setActiveConversation((prev) =>
        prev ? { ...prev, starred: data.starred } : null
      );
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConversation.id ? { ...c, starred: data.starred } : c
        )
      );
    }
  }

  return (
    <div className="flex h-[calc(100vh-2rem)] -mx-8 -mt-6 overflow-hidden">
      {/* Left Panel - Conversation List */}
      <div className="w-80 border-r border-white/10 flex flex-col bg-[#161b22] shrink-0">
        {/* Header */}
        <div className="p-3 border-b border-white/10">
          <h2 className="font-semibold text-sm mb-3">Conversations</h2>

          {/* Filter tabs */}
          <div className="flex gap-1 mb-3">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setFilter(tab.value)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                  filter === tab.value
                    ? "bg-blue-600/20 text-blue-400"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="pl-8 h-8 text-xs bg-white/5 border-white/10"
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <MessageCircle className="w-6 h-6 text-slate-600 mb-2" />
              <p className="text-xs text-slate-500">No conversations found</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <ConversationListItem
                key={conv.id}
                id={conv.id}
                contactName={conv.contactName || conv.lead?.name || null}
                phoneNumber={conv.phoneNumber}
                lastMessage={conv.messages[0]?.content || null}
                lastMessageAt={conv.lastMessageAt}
                isRead={conv.isRead}
                starred={conv.starred}
                isActive={conv.id === selectedId}
                onClick={() => selectConversation(conv.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Middle Panel - Messages */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
            <MessageCircle className="w-10 h-10 mb-3 text-slate-600" />
            <p className="text-sm">Select a conversation</p>
          </div>
        ) : loadingDetail ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full" />
          </div>
        ) : activeConversation ? (
          <>
            {/* Chat header */}
            <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3">
              <div>
                <h3 className="font-semibold text-sm">
                  {activeConversation.contactName ||
                    activeConversation.lead?.name ||
                    activeConversation.phoneNumber}
                </h3>
                <p className="text-[11px] text-slate-500">
                  {activeConversation.phoneNumber}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {activeConversation.messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  role={msg.role}
                  content={msg.content}
                  createdAt={msg.createdAt}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          </>
        ) : null}
      </div>

      {/* Right Panel - Contact Details */}
      <div className="w-80 border-l border-white/10 bg-[#161b22] shrink-0">
        {activeConversation ? (
          <ContactPanel
            conversation={activeConversation}
            onToggleStar={toggleStar}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-slate-600">
            <p className="text-xs">No contact selected</p>
          </div>
        )}
      </div>
    </div>
  );
}
