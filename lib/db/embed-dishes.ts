/**
 * Ingestion: pull every Yoruba dish from Sanity, embed it with Gemini, and
 * upsert the vectors into the Neon pgvector store.
 *
 * Run:  pnpm tsx lib/db/embed-dishes.ts
 * Needs env: DATABASE_URL (Neon) and GEMINI_API_KEY.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  // Imported after dotenv so lazy env reads pick up .env.local.
  const { embedDocuments } = await import("@/lib/ai/embeddings");
  const {
    ensureEmbeddingSchema,
    upsertDishEmbedding,
    closeEmbeddingDb,
  } = await import("@/lib/db/embeddings");
  const { getAllDishesForEmbedding, dishEmbeddingText } = await import(
    "@/sanity/lib/dish-queries"
  );

  console.log("Ensuring pgvector schema in Neon…");
  await ensureEmbeddingSchema();

  const dishes = await getAllDishesForEmbedding();
  console.log(`Fetched ${dishes.length} dishes from Sanity.`);
  if (dishes.length === 0) {
    await closeEmbeddingDb();
    return;
  }

  const texts = dishes.map(dishEmbeddingText);
  console.log("Embedding dishes with Gemini (gemini-embedding-001)…");
  const embeddings = await embedDocuments(texts);

  let stored = 0;
  for (let i = 0; i < dishes.length; i++) {
    const dish = dishes[i];
    await upsertDishEmbedding({
      dishId: dish._id,
      name: dish.name ?? null,
      content: texts[i],
      embedding: embeddings[i],
    });
    stored += 1;
    console.log(`  ✓ ${dish.name ?? dish._id}`);
  }

  console.log(`Done — ${stored} dish embeddings stored in Neon.`);
  await closeEmbeddingDb();
}

main().catch((error) => {
  console.error("Embedding ingestion failed:", error);
  process.exit(1);
});
