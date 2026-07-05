import { geolocation, ipAddress } from "@vercel/functions";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  streamText,
} from "ai";
import { checkBotId } from "botid/server";
import { after } from "next/server";
import { z } from "zod";
import { createResumableStreamContext } from "resumable-stream";
import { auth } from "@clerk/nextjs/server";
import { entitlements } from "@/lib/ai/entitlements";
import {
  allowedModelIds,
  chatModels,
  DEFAULT_CHAT_MODEL,
  getCapabilities,
} from "@/lib/ai/models";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { isProductionEnvironment } from "@/lib/constants";
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  saveChat,
  saveMessages,
  updateChatTitleById,
  updateMessage,
} from "@/lib/db/queries";
import type { DBMessage } from "@/lib/db/schema";
import { ChatbotError } from "@/lib/errors";
import { checkIpRateLimit } from "@/lib/ratelimit";
import type { ChatMessage } from "@/lib/types";
import {
  convertToUIMessages,
  generateUUID,
  getTextFromMessage,
} from "@/lib/utils";
import { searchDishes as retrieveDishes } from "@/sanity/lib/dish-queries";
import { generateTitleFromUserMessage } from "../../actions";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

export const maxDuration = 60;

function getStreamContext() {
  try {
    return createResumableStreamContext({ waitUntil: after });
  } catch (_) {
    return null;
  }
}

export { getStreamContext };

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  try {
    const { id, message, messages, selectedChatModel, selectedVisibilityType } =
      requestBody;

    const [, { userId }] = await Promise.all([
      checkBotId().catch(() => null),
      auth(),
    ]);

    // The chat route is intentionally NOT gated. Anonymous visitors can chat
    // and get answers; their conversations are simply never written to the
    // database. Only signed-in users get persistence (history, rename, delete).
    const isAuthenticated = Boolean(userId);

    const chatModel = allowedModelIds.has(selectedChatModel)
      ? selectedChatModel
      : DEFAULT_CHAT_MODEL;

    await checkIpRateLimit(ipAddress(request));

    if (userId) {
      const messageCount = await getMessageCountByUserId({
        id: userId,
        differenceInHours: 1,
      });

      if (messageCount > entitlements.maxMessagesPerHour) {
        return new ChatbotError("rate_limit:chat").toResponse();
      }
    }

    // A tool-approval continuation sends `messages` but no new `message`.
    // A normal send always carries a new `message` (and, for anon history,
    // also `messages`), so the presence of `message` disambiguates the two.
    const isToolApprovalFlow = Boolean(messages) && !message;

    let messagesFromDb: DBMessage[] = [];
    let titlePromise: Promise<string> | null = null;

    if (userId) {
      const chat = await getChatById({ id });

      if (chat) {
        if (chat.userId !== userId) {
          return new ChatbotError("forbidden:chat").toResponse();
        }
        messagesFromDb = await getMessagesByChatId({ id });
      } else if (message?.role === "user") {
        await saveChat({
          id,
          userId,
          title: "New chat",
          visibility: selectedVisibilityType,
        });
        titlePromise = generateTitleFromUserMessage({ message });
      }
    }

    let uiMessages: ChatMessage[];

    if (isToolApprovalFlow && messages && !isAuthenticated) {
      // Anonymous tool-approval continuation: no DB to rebuild from, so trust
      // the full message list the client sends (it already carries the
      // approval/denial state on the relevant tool parts).
      uiMessages = messages as ChatMessage[];
    } else if (isToolApprovalFlow && messages) {
      const dbMessages = convertToUIMessages(messagesFromDb);
      const approvalStates = new Map(
        messages.flatMap(
          (m) =>
            m.parts
              ?.filter(
                (p: Record<string, unknown>) =>
                  p.state === "approval-responded" ||
                  p.state === "output-denied"
              )
              .map((p: Record<string, unknown>) => [
                String(p.toolCallId ?? ""),
                p,
              ]) ?? []
        )
      );
      uiMessages = dbMessages.map((msg) => ({
        ...msg,
        parts: msg.parts.map((part) => {
          if (
            "toolCallId" in part &&
            approvalStates.has(String(part.toolCallId))
          ) {
            return { ...part, ...approvalStates.get(String(part.toolCallId)) };
          }
          return part;
        }),
      })) as ChatMessage[];
    } else if (isAuthenticated) {
      // Signed-in normal send: authoritative history comes from the DB, plus
      // the new user message.
      uiMessages = [
        ...convertToUIMessages(messagesFromDb),
        message as ChatMessage,
      ];
    } else {
      // Anonymous normal send: nothing is persisted server-side, so the client
      // sends the full in-session conversation in `messages` (its last item is
      // the new user message). Use it directly so the model keeps context.
      uiMessages = (messages ?? (message ? [message] : [])) as ChatMessage[];
    }

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    if (isAuthenticated && message?.role === "user") {
      await saveMessages({
        messages: [
          {
            chatId: id,
            id: message.id,
            role: "user",
            parts: message.parts,
            attachments: [],
            createdAt: new Date(),
          },
        ],
      });
    }

    const modelConfig = chatModels.find((m) => m.id === chatModel);
    const modelCapabilities = await getCapabilities();
    const capabilities = modelCapabilities[chatModel];
    const isReasoningModel = capabilities?.reasoning === true;
    const isGoogleModel = modelConfig?.provider === "google";

    const modelMessages = await convertToModelMessages(uiMessages);

    // ---- Standard RAG: retrieve first, then a SINGLE generation ----
    // Retrieve the relevant dish(es) ourselves rather than letting the model
    // call a tool. This keeps it to one model call per message (half the API
    // calls, so we stay within Gemini's free-tier limits) and gives us exact,
    // deterministic control over how many dish cards show: one card for a
    // specific-dish question, several only for a list/recommendation request.
    const latestUserText = getTextFromMessage(
      (uiMessages.at(-1) ?? message) as ChatMessage
    );
    const wantsMany =
      /\b(recommend|list|suggest|options?|several|some|a few|what|which)\b/i.test(
        latestUserText
      ) &&
      /\b(dish|dishes|food|foods|meal|meals|snack|snacks|soup|soups|swallow|recipe|recipes|option|options)\b/i.test(
        latestUserText
      );
    const retrievedDishes = await retrieveDishes(
      latestUserText,
      wantsMany ? 5 : 1
    );

    const dishesForUI = retrievedDishes.map((dish) => ({
      _id: dish._id,
      name: dish.name ?? null,
      category: dish.category ?? null,
      picture: dish.picture ?? null,
      ingredients: dish.ingredients ?? [],
    }));

    const dishContext =
      retrievedDishes.length > 0
        ? retrievedDishes
            .map((dish, i) => {
              const ingredients = (dish.ingredients ?? [])
                .map((ing) =>
                  [ing.name, ing.quantity].filter(Boolean).join(" — ")
                )
                .filter(Boolean)
                .join("; ");
              return [
                `Dish ${i + 1}: ${dish.name ?? "Unknown"}`,
                dish.category && `Category: ${dish.category}`,
                dish.backgroundText && `Background: ${dish.backgroundText}`,
                ingredients && `Ingredients: ${ingredients}`,
                dish.recipeText && `Recipe: ${dish.recipeText}`,
                dish.additionalInfoText && `More: ${dish.additionalInfoText}`,
              ]
                .filter(Boolean)
                .join("\n");
            })
            .join("\n\n---\n\n")
        : "No matching dishes were found in the knowledge base.";

    const ragSystem = `${systemPrompt({ requestHints, supportsTools: false })}

Retrieved dish information (answer using ONLY this — do not invent dishes, ingredients, origins, or steps):

${dishContext}

The interface displays each retrieved dish's picture as a card BELOW your text, so write the full written details first and never paste image URLs.`;

    const stream = createUIMessageStream({
      execute: async ({ writer: dataStream }) => {
        // Emit the retrieved dishes so the UI renders their cards (images last).
        if (dishesForUI.length > 0) {
          dataStream.write({ type: "data-dishes", data: dishesForUI });
        }

        const result = streamText({
          model: getLanguageModel(chatModel),
          system: ragSystem,
          messages: modelMessages,
          // Absorb Gemini free-tier burst throttling (429 with a retry-after of
          // ~10-30s) transparently: exponential backoff 2s/4s/8s/16s ≈ 30s of
          // patience, comfortably inside maxDuration (60s). The user just sees
          // a slower response instead of an error.
          maxRetries: 4,
          providerOptions: {
            ...(modelConfig?.gatewayOrder && {
              gateway: { order: modelConfig.gatewayOrder },
            }),
            ...(modelConfig?.reasoningEffort && {
              openai: { reasoningEffort: modelConfig.reasoningEffort },
            }),
            // Gemini implicit context caching stays on by default; disable
            // thinking on the 2.5 Flash family to cut latency (2.0 models have
            // no thinkingConfig, and Pro requires thinking).
            ...(isGoogleModel &&
              chatModel.includes("2.5-flash") && {
                google: { thinkingConfig: { thinkingBudget: 0 } },
              }),
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: "stream-text",
          },
        });

        dataStream.merge(
          result.toUIMessageStream({ sendReasoning: isReasoningModel })
        );

        if (titlePromise) {
          const title = await titlePromise;
          dataStream.write({ type: "data-chat-title", data: title });
          updateChatTitleById({ chatId: id, title });
        }
      },
      generateId: generateUUID,
      onFinish: async ({ messages: finishedMessages }) => {
        // Anonymous chats are ephemeral — never persist them.
        if (!isAuthenticated) {
          return;
        }
        if (isToolApprovalFlow) {
          for (const finishedMsg of finishedMessages) {
            const existingMsg = uiMessages.find((m) => m.id === finishedMsg.id);
            if (existingMsg) {
              await updateMessage({
                id: finishedMsg.id,
                parts: finishedMsg.parts,
              });
            } else {
              await saveMessages({
                messages: [
                  {
                    id: finishedMsg.id,
                    role: finishedMsg.role,
                    parts: finishedMsg.parts,
                    createdAt: new Date(),
                    attachments: [],
                    chatId: id,
                  },
                ],
              });
            }
          }
        } else if (finishedMessages.length > 0) {
          await saveMessages({
            messages: finishedMessages.map((currentMessage) => ({
              id: currentMessage.id,
              role: currentMessage.role,
              parts: currentMessage.parts,
              createdAt: new Date(),
              attachments: [],
              chatId: id,
            })),
          });
        }
      },
      onError: (error) => {
        const errorMessage = error instanceof Error ? error.message : "";

        if (
          errorMessage.includes(
            "AI Gateway requires a valid credit card on file to service requests"
          )
        ) {
          return "AI Gateway requires a valid credit card on file to service requests. Please visit https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dadd-credit-card to add a card and unlock your free credits.";
        }

        // Gemini free-tier throttling (HTTP 429 / RESOURCE_EXHAUSTED). Surface a
        // clear, actionable message instead of a generic error so the chat
        // doesn't silently show "nothing".
        if (
          /quota|rate.?limit|resource_exhausted|too many requests|429/i.test(
            errorMessage
          )
        ) {
          return "The assistant is temporarily over its usage limit. Please wait a minute and try again — if it keeps happening, the daily free quota is exhausted and resets at midnight PT.";
        }

        return "Oops, an error occurred!";
      },
    });

    return createUIMessageStreamResponse({
      stream,
      async consumeSseStream({ stream: sseStream }) {
        // Resumable streams are keyed off a persisted chat row, so they only
        // apply to signed-in users.
        if (!(isAuthenticated && process.env.REDIS_URL)) {
          return;
        }
        try {
          const streamContext = getStreamContext();
          if (streamContext) {
            const streamId = generateId();
            await createStreamId({ streamId, chatId: id });
            await streamContext.createNewResumableStream(
              streamId,
              () => sseStream
            );
          }
        } catch (_) {
          /* non-critical */
        }
      },
    });
  } catch (error) {
    const vercelId = request.headers.get("x-vercel-id");

    if (error instanceof ChatbotError) {
      return error.toResponse();
    }

    if (
      error instanceof Error &&
      error.message?.includes(
        "AI Gateway requires a valid credit card on file to service requests"
      )
    ) {
      return new ChatbotError("bad_request:activate_gateway").toResponse();
    }

    console.error("Unhandled error in chat API:", error, { vercelId });
    return new ChatbotError("offline:chat").toResponse();
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const { userId } = await auth();

  if (!userId) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id });

  if (chat?.userId !== userId) {
    return new ChatbotError("forbidden:chat").toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}

const renameSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(80),
});

// Rename a chat. Only the signed-in owner can rename their own chat.
export async function PATCH(request: Request) {
  let id: string;
  let title: string;

  try {
    const parsed = renameSchema.parse(await request.json());
    id = parsed.id;
    title = parsed.title;
  } catch {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const { userId } = await auth();

  if (!userId) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id });

  if (!chat) {
    return new ChatbotError("not_found:chat").toResponse();
  }

  if (chat.userId !== userId) {
    return new ChatbotError("forbidden:chat").toResponse();
  }

  await updateChatTitleById({ chatId: id, title });

  return Response.json({ id, title }, { status: 200 });
}
