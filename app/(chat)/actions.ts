"use server";

import { generateText, type UIMessage } from "ai";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import type { VisibilityType } from "@/components/chat/visibility-selector";
import { titleModel } from "@/lib/ai/models";
import { titlePrompt } from "@/lib/ai/prompts";
import { getTitleModel } from "@/lib/ai/providers";
import {
  deleteMessagesByChatIdAfterTimestamp,
  getChatById,
  getMessageById,
  updateChatVisibilityById,
} from "@/lib/db/queries";
import { getTextFromMessage } from "@/lib/utils";

export async function saveChatModelAsCookie(model: string) {
  const cookieStore = await cookies();
  cookieStore.set("chat-model", model);
}

export async function generateTitleFromUserMessage({
  message,
}: {
  message: UIMessage;
}) {
  const userText = getTextFromMessage(message);
  try {
    const { text } = await generateText({
      model: getTitleModel(),
      system: titlePrompt,
      prompt: userText,
      // Titles are best-effort: don't burn rate-limit budget (shared with the
      // chat model) on retries — fall back to the message text instead.
      maxRetries: 0,
      providerOptions: {
        // Only route through the gateway when the title model lives there; the
        // default Gemini title model is served directly.
        ...(titleModel.gatewayOrder && {
          gateway: { order: titleModel.gatewayOrder },
        }),
      },
    });
    const cleaned = text
      .replace(/^[#*"\s]+/, "")
      .replace(/["]+$/, "")
      .trim();
    if (cleaned) {
      return cleaned;
    }
  } catch {
    // Fall through to the message-derived title.
  }
  return userText.length > 60 ? `${userText.slice(0, 57)}…` : userText;
}

export async function deleteTrailingMessages({ id }: { id: string }) {
  const { userId } = await auth();
  // Anonymous chats are never persisted, so there is nothing to trim on the
  // server — the client trims its local message state on its own.
  if (!userId) {
    return;
  }

  const [message] = await getMessageById({ id });
  // Message isn't in the DB (e.g. an unpersisted chat); nothing to trim.
  if (!message) {
    return;
  }

  const chat = await getChatById({ id: message.chatId });
  if (!chat || chat.userId !== userId) {
    throw new Error("Unauthorized");
  }

  await deleteMessagesByChatIdAfterTimestamp({
    chatId: message.chatId,
    timestamp: message.createdAt,
  });
}

export async function updateChatVisibility({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: VisibilityType;
}) {
  const { userId } = await auth();
  // Anonymous chats aren't persisted, so visibility has nothing to update.
  if (!userId) {
    return;
  }

  const chat = await getChatById({ id: chatId });
  // Chat not persisted yet (or owned by someone else) — nothing to do / deny.
  if (!chat) {
    return;
  }
  if (chat.userId !== userId) {
    throw new Error("Unauthorized");
  }

  await updateChatVisibilityById({ chatId, visibility });
}
