import type { UseChatHelpers } from "@ai-sdk/react";
import { AlertCircleIcon, ArrowDownIcon, RotateCcwIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { useMessages } from "@/hooks/use-messages";
import type { Vote } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { useDataStream } from "./data-stream-provider";
import { Greeting } from "./greeting";
import { PreviewMessage, ThinkingMessage } from "./message";

type MessagesProps = {
  addToolApprovalResponse: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  chatId: string;
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  status: UseChatHelpers<ChatMessage>["status"];
  votes: Vote[] | undefined;
  messages: ChatMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  isReadonly: boolean;
  isLoading?: boolean;
  onEditMessage?: (message: ChatMessage) => void;
  error?: Error;
};

function PureMessages({
  addToolApprovalResponse,
  chatId,
  sendMessage,
  status,
  votes,
  messages,
  setMessages,
  regenerate,
  isReadonly,
  isLoading,
  onEditMessage,
  error,
}: MessagesProps) {
  const {
    containerRef: messagesContainerRef,
    endRef: messagesEndRef,
    isAtBottom,
    scrollToBottom,
    hasSentMessage,
    reset,
  } = useMessages({
    status,
  });

  useDataStream();

  const prevChatIdRef = useRef(chatId);
  useEffect(() => {
    if (prevChatIdRef.current !== chatId) {
      prevChatIdRef.current = chatId;
      reset();
    }
  }, [chatId, reset]);

  return (
    <div className="relative flex-1 bg-background">
      <div 
        suppressHydrationWarning
        className={cn(
          "absolute inset-0 overflow-y-auto pointer-events-auto",
          (messages.length > 0 || isLoading) && "hidden"
        )}
      >
        <Greeting chatId={chatId} sendMessage={sendMessage} />
      </div>
      <div
        suppressHydrationWarning
        className={cn(
          "absolute inset-0 touch-pan-y overflow-y-auto",
          messages.length > 0
            ? "bg-background"
            : "bg-transparent pointer-events-none"
        )}
        ref={messagesContainerRef}
      >
        <div className="mx-auto flex min-h-full min-w-0 max-w-4xl flex-col gap-5 px-2 py-6 md:gap-7 md:px-4">
          {messages.map((message, index) => (
            <PreviewMessage
              addToolApprovalResponse={addToolApprovalResponse}
              chatId={chatId}
              isLoading={
                status === "streaming" && messages.length - 1 === index
              }
              isReadonly={isReadonly}
              key={message.id}
              message={message}
              onEdit={onEditMessage}
              regenerate={regenerate}
              requiresScrollPadding={
                hasSentMessage && index === messages.length - 1
              }
              setMessages={setMessages}
              vote={
                votes
                  ? votes.find((vote) => vote.messageId === message.id)
                  : undefined
              }
            />
          ))}

          {status === "submitted" && messages.at(-1)?.role !== "assistant" && (
            <ThinkingMessage />
          )}

          {error && messages.at(-1)?.role === "user" && (
            <div className="flex items-start gap-3 animate-[fade-up_0.25s_cubic-bezier(0.22,1,0.36,1)]">
              <div className="flex h-[calc(13px*1.65)] shrink-0 items-center">
                <div className="flex size-7 items-center justify-center rounded-lg bg-destructive/10 text-destructive ring-1 ring-destructive/20 dark:bg-destructive/20 dark:text-destructive-foreground dark:ring-destructive/30">
                  <AlertCircleIcon className="size-3.5" />
                </div>
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="text-[13px] leading-[1.65] text-destructive dark:text-destructive-foreground/90 font-medium">
                  {error.message ||
                    "We're having trouble sending your message. Please check your internet connection and try again."}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    className="text-muted-foreground hover:text-foreground text-xs"
                    onClick={() => regenerate()}
                    size="xs"
                    variant="outline"
                  >
                    <RotateCcwIcon className="size-3 mr-1" />
                    Try again
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div
            className="min-h-[24px] min-w-[24px] shrink-0"
            ref={messagesEndRef}
          />
        </div>
      </div>

      <button
        aria-label="Scroll to bottom"
        className={`absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center rounded-full border border-border/50 bg-card/90 px-3.5 shadow-[var(--shadow-float)] backdrop-blur-lg transition-all duration-200 h-7 text-[10px] ${
          isAtBottom
            ? "pointer-events-none scale-90 opacity-0"
            : "pointer-events-auto scale-100 opacity-100"
        }`}
        onClick={() => scrollToBottom("smooth")}
        type="button"
      >
        <ArrowDownIcon className="size-3 text-muted-foreground" />
      </button>
    </div>
  );
}

export const Messages = PureMessages;
