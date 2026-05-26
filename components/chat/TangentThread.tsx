"use client";

import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { useThreadChatSync } from "@/hooks/use-thread-chat-sync";
import { useThreadMergeEvents } from "@/lib/api-hooks";

interface TangentThreadProps {
  threadId: string;
  parentThreadId: string;
  conversationId: string;
  activeChildMessageId?: string;
  activeHighlightedText?: string;
  onOpenTangent: (
    threadId: string,
    messageId: string,
    selectedText: string,
    rect: DOMRect
  ) => void;
}

export function TangentThread({
  threadId,
  conversationId,
  activeChildMessageId,
  activeHighlightedText,
  onOpenTangent,
}: TangentThreadProps) {
  const { displayMessages, sendMessage, isLoading } =
    useThreadChatSync(threadId);
  const { data: mergeEvents = [] } = useThreadMergeEvents(threadId);

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <MessageList
        messages={displayMessages}
        threadId={threadId}
        isStreaming={isLoading}
        mergeEvents={mergeEvents}
        onOpenTangent={onOpenTangent}
        activeChildMessageId={activeChildMessageId}
        activeHighlightedText={activeHighlightedText}
        conversationId={conversationId}
      />
      <ChatInput
        onSend={(text) => sendMessage({ text })}
        isLoading={isLoading}
        placeholder={displayMessages.length === 0 ? "Ask a question…" : undefined}
        conversationId={conversationId}
      />
    </div>
  );
}
