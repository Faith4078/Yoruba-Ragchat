import { embed, embedMany } from "ai";
import { googleProvider } from "./google";

// Gemini embeddings via the shared Google provider (reads GEMINI_API_KEY).
// gemini-embedding-001 defaults to 3072 dims but supports Matryoshka truncation;
// we request 768 dims so the vector fits the pgvector HNSW index (max 2000 dims)
// and the existing `vector(768)` column. Cosine similarity is scale-invariant,
// so the truncated vectors need no manual normalization. Docs and queries use
// the matching RETRIEVAL_DOCUMENT / RETRIEVAL_QUERY task types. Keep
// EMBEDDING_DIM in sync with the DB column.
export const EMBEDDING_MODEL_ID = "gemini-embedding-001";
export const EMBEDDING_DIM = 768;

const embeddingModel = googleProvider.textEmbeddingModel(EMBEDDING_MODEL_ID);

export async function embedQuery(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingModel,
    value: text,
    providerOptions: {
      google: {
        outputDimensionality: EMBEDDING_DIM,
        taskType: "RETRIEVAL_QUERY",
      },
    },
  });
  return embedding;
}

export async function embedDocuments(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }
  const { embeddings } = await embedMany({
    model: embeddingModel,
    values: texts,
    providerOptions: {
      google: {
        outputDimensionality: EMBEDDING_DIM,
        taskType: "RETRIEVAL_DOCUMENT",
      },
    },
  });
  return embeddings;
}
