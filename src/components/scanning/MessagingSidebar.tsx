"use client";

// npx prisma studio --port 5556

import React, { useState, useRef, useCallback, useEffect } from "react";
import { Send, AlertCircle } from "lucide-react";

type MsgStatus = "pending" | "sent" | "error";

interface OptimisticMessage {
  localId:   string;
  serverId?: string;          // filled in after POST confirms
  content:   string;
  sender:    "patient" | "dentist";
  createdAt: string;
  status:    MsgStatus;
}

interface Props {
  scanId: string;
}

const POLL_INTERVAL_MS = 4000; // I would use WebSockets in a real app, but polling is simpler for this exercise and meets requirements. 4s is a good balance between responsiveness and server load for a low-traffic scenario like this.

export function MessagingSidebar({ scanId }: Props) {
  const [messages,  setMessages]  = useState<OptimisticMessage[]>([]);
  const [draft,     setDraft]     = useState("");
  const [threadId,  setThreadId]  = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const listRef                    = useRef<HTMLDivElement>(null);
  const threadIdRef                = useRef<string | null>(null);

  // Keep ref in sync so the polling interval can read latest threadId
  useEffect(() => { threadIdRef.current = threadId; }, [threadId]);

  // Polling new messages to test Dentist replies, again in a real app I would use WebSockets or Server-Sent Events for this
  useEffect(() => {
    const poll = async () => {
      const tid = threadIdRef.current;
      if (!tid) return;

      try {
        const res = await fetch(`/api/messaging?threadId=${tid}`);
        if (!res.ok) return;
        const data = await res.json() as { messages: { id: string; content: string; sender: string; createdAt: string }[] };

        setMessages((prev) => {
          const seenServerIds = new Set(prev.map((m) => m.serverId).filter(Boolean));
          const incoming = data.messages
            .filter((sm) => !seenServerIds.has(sm.id))
            .map((sm) => ({
              localId:   sm.id,
              serverId:  sm.id,
              content:   sm.content,
              sender:    sm.sender as "patient" | "dentist",
              createdAt: sm.createdAt,
              status:    "sent" as MsgStatus,
            }));

          if (incoming.length === 0) return prev;

          // Merge: drop optimistic "sent" patient messages that now have a server record,
          // then append any truly new messages (e.g. dentist replies)
          const merged = [
            ...prev.filter(
              (m) => !(m.status === "sent" && m.sender === "patient" && !m.serverId &&
                incoming.some((i) => i.sender === "patient" && i.content === m.content))
            ),
            ...incoming.filter((i) => !prev.some((m) => m.serverId === i.serverId)),
          ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

          return merged;
        });
      } catch {
        // silently ignore poll errors
      }
    };

    const id = setInterval(poll, POLL_INTERVAL_MS);
    poll(); // immediate first fetch
    return () => clearInterval(id);
  }, []); // runs once; reads threadId via ref

  // ── Shared dispatch ───────────────────────────────────────────────────────
  const dispatch = useCallback(async (content: string, localId: string, currentThreadId: string | null) => {
    const body: Record<string, string> = { content, sender: "patient" };
    if (currentThreadId) {
      body.threadId = currentThreadId;
    } else {
      body.patientId = scanId;
    }

    const res = await fetch("/api/messaging", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json() as { threadId?: string; messageId?: string };
    if (!currentThreadId && data.threadId) setThreadId(data.threadId);

    setMessages((prev) =>
      prev.map((m) => m.localId === localId ? { ...m, status: "sent", serverId: data.messageId } : m)
    );
  }, [scanId]);

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const content = draft.trim();
    if (!content || isSending) return;

    const localId = crypto.randomUUID();
    setDraft("");
    setIsSending(true);

    setMessages((prev) => [
      ...prev,
      { localId, content, sender: "patient", createdAt: new Date().toISOString(), status: "pending" },
    ]);

    requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    });

    try {
      await dispatch(content, localId, threadId);
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.localId === localId ? { ...m, status: "error" } : m))
      );
    } finally {
      setIsSending(false);
    }
  }, [draft, isSending, dispatch, threadId]);

  // ── Retry ─────────────────────────────────────────────────────────────────
  const handleRetry = useCallback(async (msg: OptimisticMessage) => {
    setMessages((prev) =>
      prev.map((m) => (m.localId === msg.localId ? { ...m, status: "pending" } : m))
    );
    try {
      await dispatch(msg.content, msg.localId, threadId);
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.localId === msg.localId ? { ...m, status: "error" } : m))
      );
    }
  }, [dispatch, threadId]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // Auto-scroll when messages change
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  return (
    <div className="w-full border border-zinc-800 rounded-xl bg-zinc-900 overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-950">
        <h3 className="text-sm font-semibold text-white">Message Your Clinic</h3>
        <p className="text-xs text-zinc-500 mt-0.5">Ask questions or share concerns about your scan</p>
      </div>

      {/* Message list */}
      <div ref={listRef} className="flex flex-col gap-2 p-4 h-48 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-xs text-zinc-600 text-center mt-auto">No messages yet. Say hello!</p>
        )}
        {messages.map((msg) => {
          const isPatient = msg.sender === "patient";
          return (
            <div key={msg.localId} className={`flex flex-col gap-1 ${isPatient ? "items-end" : "items-start"}`}>
              {!isPatient && (
                <span className="text-[10px] text-zinc-500 px-1">Clinic</span>
              )}
              <div
                className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm
                  ${isPatient ? "rounded-br-sm" : "rounded-bl-sm bg-zinc-700 text-white"}
                  ${isPatient && msg.status === "pending" ? "opacity-60 bg-blue-600" : ""}
                  ${isPatient && msg.status === "sent"    ? "opacity-100 bg-blue-600" : ""}
                  ${isPatient && msg.status === "error"   ? "opacity-100 bg-red-900/60 border border-red-700" : ""}
                `}
              >
                {msg.content}
              </div>
              {msg.status === "error" && (
                <button
                  onClick={() => handleRetry(msg)}
                  className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300 transition-colors"
                >
                  <AlertCircle size={10} />
                  Failed — tap to retry
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="flex items-end gap-2 p-3 border-t border-zinc-800">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          rows={1}
          maxLength={2000}
          className="flex-1 bg-zinc-800 text-sm text-white placeholder-zinc-600 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={handleSend}
          disabled={!draft.trim() || isSending}
          className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center shrink-0 disabled:opacity-40 active:scale-90 transition-transform"
          aria-label="Send message"
        >
          <Send size={15} className="text-white" />
        </button>
      </div>
    </div>
  );
}

