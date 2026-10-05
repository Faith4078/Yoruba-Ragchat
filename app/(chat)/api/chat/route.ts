import { auth } from "@clerk/nextjs/server";
import { geolocation, ipAddress } from "@vercel/functions";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  stepCountIs,
  streamText,
} from "ai";
import { checkBotId } from "botid/server";
import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";
import { z } from "zod";
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
import { searchDishes as dishSearchTool } from "@/lib/ai/tools/search-dishes";
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
    const { id, message, messages, selectedChatModel, selectedVisibilityType, selectedLanguage } =
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
    // Agentic retrieval needs real tool-calling support. Models without it
    // fall back to the heuristic pre-retrieval path further down.
    const supportsTools = capabilities?.tools === true;

    const modelMessages = await convertToModelMessages(uiMessages);

    const latestUserText = getTextFromMessage(
      (uiMessages.at(-1) ?? message) as ChatMessage
    );

    let ragSystem: string;
    let dishesForUI: Array<{
      _id: string;
      name: string | null;
      category: string | null;
      picture: unknown;
      ingredients: unknown[];
      history: string | null;
      regionalVariations: string | null;
      cookingInstructions: string[] | null;
    }> = [];
    let toolsForModel: { searchDishes: typeof dishSearchTool } | undefined;
    let stopWhenForModel: ReturnType<typeof stepCountIs> | undefined;

    if (supportsTools) {
      // ---- Agentic RAG: the model itself decides whether/what to retrieve ----
      // Trades the "exactly one Gemini call per turn" guarantee of the
      // heuristic path below for correctness on queries the regex heuristics
      // can't classify (non-English phrasing, unusual wording, follow-ups).
      // Turns where the model actually calls searchDishes cost 2 calls
      // (tool call + final answer) instead of 1 — eats into the free-tier
      // daily quota faster. stepCountIs(4) caps it well short of runaway
      // tool-call loops.
      ragSystem = systemPrompt({
        requestHints,
        supportsTools: true,
        language: selectedLanguage ?? "en",
      });
      toolsForModel = { searchDishes: dishSearchTool };
      stopWhenForModel = stepCountIs(4);
    } else {
      // ---- Fallback for models without tool-calling support: retrieve
      // first with regex heuristics, then a SINGLE generation. ----
      // Multi-turn context: if the current query is short, prepend the previous user query
      let queryText = latestUserText;
      if (uiMessages.length > 2 && queryText.split(/\s+/).length <= 8) {
        const prevUserMsgs = uiMessages.filter((m) => m.role === "user");
        const prevUserMsg = prevUserMsgs.length > 1 ? prevUserMsgs[prevUserMsgs.length - 2] : null;
        if (prevUserMsg) {
          queryText = `${getTextFromMessage(prevUserMsg as ChatMessage)} ${queryText}`;
        }
      }

      const wantsMany =
        /\b(recommend|list|suggest|options?|several|some|a few|what|which)\b/i.test(
          queryText
        ) &&
        /\b(dish|dishes|food|foods|meal|meals|snack|snacks|soup|soups|swallow|recipe|recipes|option|options)\b/i.test(
          queryText
        );

      const isGreeting = /^(hi|hello|hey|good morning|good afternoon|good evening|how are you|what can you do|who are you|thanks|thank you|bawo\s*ni+|e\s*kaaro|e\s*ku\s*irole|e\s*ku\s*ale|e\s*kaasan|pele\s*o|o\s*da\s*aro|kilode|se\s*alafia\s*ni|how\s*far|wetin\s*dey|na\s*you\s*berekete|how\s*bodu|how\s*body|how\s*you\s*dey|abeg|sowapa|sho\s*wa\s*pa)\b/i.test(latestUserText.trim());

      const retrievedDishes = isGreeting ? [] : await retrieveDishes(
        queryText,
        wantsMany ? 5 : 1
      );

      const wantsIngredients = /\b(ingredient|ingredients|what is inside|what's inside|made of)\b/i.test(latestUserText);
      const wantsHistory = /\b(history|origin|from|where|cultural|story|background|who made|invented)\b/i.test(latestUserText);
      const wantsRecipe = /\b(recipe|cook|make|prepare|steps|instructions|how to)\b/i.test(latestUserText);

      let sectionsToShow = {
        ingredients: wantsIngredients || wantsRecipe,
        history: wantsHistory,
        recipe: wantsRecipe,
      };

      // If the user didn't ask for specific parts, show everything by default.
      if (!wantsIngredients && !wantsHistory && !wantsRecipe) {
        sectionsToShow = { ingredients: true, history: true, recipe: true };
      }

      dishesForUI = retrievedDishes.map((dish) => ({
        _id: dish._id,
        name: dish.name ?? null,
        category: dish.category ?? null,
        picture: dish.picture ?? null,
        ingredients: sectionsToShow.ingredients ? (dish.ingredients ?? []) : [],
        history: sectionsToShow.history ? (dish.backgroundText ?? null) : null,
        regionalVariations: sectionsToShow.history ? (dish.additionalInfoText ?? null) : null,
        cookingInstructions: sectionsToShow.recipe && dish.recipeText ? dish.recipeText.split('\n').filter(s => s.trim()) : null,
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
                  `ID: ${dish._id}`,
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

      ragSystem = `${systemPrompt({ requestHints, supportsTools: false, language: selectedLanguage ?? "en" })}

Retrieved dish information:
(If the user is asking a recipe question, answer using ONLY this — do not invent dishes, ingredients, origins, or steps.)
(If the user is just greeting you or chatting off-topic, IGNORE these retrieved dishes entirely and just respond to their chat.)

${dishContext}

When you cite information from a retrieved dish, add a small superscript number like [1] after the claim. Do NOT include a Sources section or any links at the end — the dish card already serves as the visual citation.

${retrievedDishes.length > 0 ? `CRITICAL INSTRUCTION FOR DISHES:
You are chatting alongside a rich graphical UI that displays "Dish Cards" for every dish you retrieve. This card perfectly renders all the ingredients, history, and cooking instructions visually. 
Because of this, you must NEVER write out the ingredients list, recipe steps, or history in your text output! Doing so is highly redundant and ruins the user experience.
Your text response MUST be limited to a SINGLE, extremely short introductory sentence that EXPLICITLY mentions the dish name (e.g., "Here is the history of Amala:", "These are the ingredients for Marùgbó:"). DO NOT output bullet points, numbered lists, or paragraphs when talking about a retrieved dish. Let the card do the talking!` : ""}`;
    }

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
          tools: toolsForModel,
          stopWhen: stopWhenForModel,
          // Gemini models retry (exponential backoff) and fall back to another
          // model inside getLanguageModel (lib/ai/resilient-model.ts), so the SDK
          // must not retry on top of that. Gateway models keep the SDK retries.
          maxRetries: isGoogleModel ? 0 : 4,
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
