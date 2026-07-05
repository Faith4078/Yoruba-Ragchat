import { customProvider, gateway } from "ai";
import { isTestEnvironment } from "../constants";
import { googleProvider } from "./google";
import { directModelIds, titleModel } from "./models";

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
    return googleProvider.languageModel(modelId);
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
