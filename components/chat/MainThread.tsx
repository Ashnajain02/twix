"use client";

import { useEffect, useRef } from "react";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { useThreadChatSync } from "@/hooks/use-thread-chat-sync";
import {
  useInvalidateConversations,
  useThreadMergeEvents,
} from "@/lib/api-hooks";

interface MainThreadProps {
  threadId: string;
  conversationId: string;
  /** ID of the message that spawned the currently visible tangent panel. */
  activeChildMessageId?: string;
  /** The highlighted text within the active-child message. */
  activeHighlightedText?: string;
  onOpenTangent: (
    threadId: string,
    messageId: string,
    selectedText: string,
    rect: DOMRect
  ) => void;
  initialMessages?: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
  }>;
}

export function MainThread({
  threadId,
  conversationId,
  activeChildMessageId,
  activeHighlightedText,
  onOpenTangent,
  initialMessages,
}: MainThreadProps) {
  const { displayMessages, sendMessage, status, isLoading } = useThreadChatSync(
    threadId,
    initialMessages
  );
  const { data: mergeEvents = [] } = useThreadMergeEvents(threadId);
  const invalidateConversations = useInvalidateConversations();

  // Refresh the sidebar once streaming finishes — the server may have
  // auto-titled the conversation in the chat route's onFinish handler.
  const prevStatusRef = useRef(status);
  useEffect(() => {
    if (prevStatusRef.current === "streaming" && status === "ready") {
      invalidateConversations();
    }
    prevStatusRef.current = status;
  }, [status, invalidateConversations]);

  return (
    <div className="flex h-full flex-col">
      <MessageList
        messages={displayMessages}
        threadId={threadId}
        isStreaming={isLoading}
        mergeEvents={mergeEvents}
        activeChildMessageId={activeChildMessageId}
        activeHighlightedText={activeHighlightedText}
        conversationId={conversationId}
        onOpenTangent={onOpenTangent}
      />
      <ChatInput
        onSend={(text) => sendMessage({ text })}
        isLoading={isLoading}
        conversationId={conversationId}
      />
    </div>
  );
}
