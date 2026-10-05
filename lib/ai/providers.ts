import { customProvider, gateway } from "ai";
import { isTestEnvironment } from "../constants";
import { googleProvider } from "./google";
import {
  DEFAULT_CHAT_MODEL,
  directModelIds,
  GEMINI_FALLBACK_MODEL_ID,
  titleModel,
} from "./models";
import { withRateLimitFallback } from "./resilient-model";

export const myProvider = isTestEnvironment
  ? (() => {
      const { chatModel, titleModel } = require("./models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "title-model": titleModel,
        },
      });
    })()
  : null;

export function getLanguageModel(modelId: string) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(modelId);
  }

  // Gemini models are served directly via the user's GEMINI_API_KEY; everything
  // else routes through the Vercel AI Gateway.
  if (directModelIds.has(modelId)) {
    // Retries with backoff, then falls back to another Gemini model when the
    // selected one is rate limited. A model never falls back to itself: if the
    // fallback model is selected, the default model takes over instead.
    const fallbackId =
      modelId === GEMINI_FALLBACK_MODEL_ID
        ? DEFAULT_CHAT_MODEL
        : GEMINI_FALLBACK_MODEL_ID;
    return withRateLimitFallback(
      googleProvider.languageModel(modelId),
      googleProvider.languageModel(fallbackId)
    );
  }

  return gateway.languageModel(modelId);
}

export function getTitleModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }
  if (directModelIds.has(titleModel.id)) {
    return googleProvider.languageModel(titleModel.id);
  }
  return gateway.languageModel(titleModel.id);
}
