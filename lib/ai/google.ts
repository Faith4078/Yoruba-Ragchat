import { createGoogleGenerativeAI } from "@ai-sdk/google";

// Single configured Google Generative AI (Gemini) provider used for both chat
// and embeddings. The @ai-sdk/google default only reads
// GOOGLE_GENERATIVE_AI_API_KEY, but this project stores the key as
// GEMINI_API_KEY, so we wire both up here and prefer GEMINI_API_KEY.
export const googleProvider = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});
