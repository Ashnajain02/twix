"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/ui-store";
import {
  useConversations,
  useCreateConversation,
  useDeleteConversation,
  useRenameConversation,
} from "@/lib/api-hooks";

export function ConversationSidebar() {
  const router = useRouter();
  const params = useParams();
  const activeId = params?.conversationId as string | undefined;
  const { data: session } = useSession();

  const { data: conversations = [] } = useConversations();
  const createConversation = useCreateConversation();
  const deleteConversation = useDeleteConversation();
  const renameConversation = useRenameConversation();

  const { sidebarOpen, toggleSidebar } = useUIStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  async function handleNewConversation() {
    const result = await createConversation.mutateAsync({});
    router.push(`/c/${result.conversation.id}`);
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    await deleteConversation.mutateAsync(id);
    if (activeId === id) router.push("/c");
  }

  function startRename(e: React.MouseEvent, conv: { id: string; title: string }) {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditValue(conv.title);
  }

  async function commitRename(id: string) {
    const trimmed = editValue.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    try {
      await renameConversation.mutateAsync({ id, title: trimmed });
    } finally {
      setEditingId(null);
    }
  }

  function handleRenameKeyDown(e: React.KeyboardEvent, id: string) {
    if (e.key === "Enter") commitRename(id);
    if (e.key === "Escape") setEditingId(null);
  }

  return (
    <aside
      className={cn(
        "flex h-full flex-col transition-all duration-200 ease-in-out overflow-hidden",
        sidebarOpen ? "w-64" : "w-0"
      )}
      style={{ background: "var(--color-bg-sidebar)", borderRight: "1px solid var(--color-border)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--color-border-subtle)" }}
      >
        <div className="flex items-center gap-2">
          <Image src="/logo.svg" alt="" width={20} height={20} className="h-5 w-5" />
          <span className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--color-text-primary)" }}>
            twix
          </span>
        </div>
        <button
          type="button"
          onClick={toggleSidebar}
          className="btn-toolbar-icon rounded-md p-1.5 transition-colors"
          aria-label="Close sidebar"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* New conversation */}
      <div className="px-3 pt-3 pb-2 flex-shrink-0">
        <button
          type="button"
          onClick={handleNewConversation}
          disabled={createConversation.isPending}
          className="btn-primary flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors"
        >
          <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="font-medium">New conversation</span>
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {conversations.length === 0 && (
          <p className="px-3 py-4 text-xs text-center" style={{ color: "var(--color-text-muted)" }}>
            No conversations yet
          </p>
        )}
        {conversations.map((conv) => {
          const isActive = activeId === conv.id;
          const isEditing = editingId === conv.id;

          return (
            <div
              key={conv.id}
              className={cn(
                "conv-row group relative flex items-center rounded-lg pl-3 pr-1 py-2 text-sm transition-colors mt-0.5",
                isActive && "conv-row--active"
              )}
            >
              {/* Chat icon */}
              <svg
                className="conv-row__icon mr-2 h-3.5 w-3.5 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.75}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>

              {isEditing ? (
                <input
                  ref={editInputRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => commitRename(conv.id)}
                  onKeyDown={(e) => handleRenameKeyDown(e, conv.id)}
                  aria-label="Rename conversation"
                  className="flex-1 min-w-0 rounded px-1 py-0 text-sm outline-none"
                  style={{
                    background: "var(--color-bg-elevated)",
                    border: "1px solid var(--color-accent)",
                    color: "var(--color-text-primary)",
                  }}
                />
              ) : (
                // Native <a>: keyboard-accessible, prefetched, and the hover/active
                // styling reaches the icon + label via the `.conv-row` parent.
                <Link
                  href={`/c/${conv.id}`}
                  className="conv-row__label flex-1 truncate"
                >
                  {conv.title}
                </Link>
              )}

              {/* Action buttons — visible on hover or focus-within */}
              {!isEditing && (
                <div className="conv-row__actions flex items-center gap-0.5 ml-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={(e) => startRename(e, conv)}
                    aria-label={`Rename ${conv.title}`}
                    className="conv-row__action rounded p-0.5 transition-colors"
                  >
                    <svg
                      className="h-3 w-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, conv.id)}
                    aria-label={`Delete ${conv.title}`}
                    className="conv-row__action conv-row__action--danger rounded p-0.5 transition-colors"
                  >
                    <svg
                      className="h-3 w-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {/* User account footer */}
      {session?.user && (
        <div
          className="flex-shrink-0 px-3 py-2.5"
          style={{ borderTop: "1px solid var(--color-border)" }}
        >
          <div className="flex items-center gap-2">
            {/* Avatar initial */}
            <div
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{ background: "var(--color-accent)" }}
            >
              {(session.user.name ?? session.user.email ?? "?")[0].toUpperCase()}
            </div>
            {/* Name / email */}
            <div className="min-w-0 flex-1">
              {session.user.name && (
                <p
                  className="truncate text-xs font-medium"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {session.user.name}
                </p>
              )}
              {session.user.email && (
                <p
                  className="truncate text-[10px]"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {session.user.email}
                </p>
              )}
            </div>
            {/* Logout button */}
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              className="btn-signout flex-shrink-0 rounded-md p-1.5 transition-colors"
              aria-label="Sign out"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
