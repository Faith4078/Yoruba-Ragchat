import { cosineDistance, desc, gt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { pgTable, text, timestamp, vector } from "drizzle-orm/pg-core";
import postgres from "postgres";
import { EMBEDDING_DIM } from "@/lib/ai/embeddings";

// The Yoruba-dish vector store lives in Neon (DATABASE_URL). It is intentionally
// separate from the app's chat/user tables so it can be rebuilt independently.
// Lazily initialised so env vars (loaded via dotenv in scripts) are read at
// call time rather than at import.
let clientSingleton: ReturnType<typeof postgres> | null = null;
let dbSingleton: ReturnType<typeof drizzle> | null = null;

function getDb() {
  if (!clientSingleton) {
    const connectionString =
      process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "";
    clientSingleton = postgres(connectionString, { max: 1 });
    dbSingleton = drizzle(clientSingleton);
  }
  return { client: clientSingleton, db: dbSingleton as ReturnType<typeof drizzle> };
}

export const dishEmbedding = pgTable("dish_embedding", {
  dishId: text("dish_id").primaryKey(),
  name: text("name"),
  content: text("content"),
  embedding: vector("embedding", { dimensions: EMBEDDING_DIM }),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type DishEmbeddingRow = typeof dishEmbedding.$inferInsert;

// Idempotent DDL: enable pgvector and create the table + cosine HNSW index.
export async function ensureEmbeddingSchema(): Promise<void> {
  const { client } = getDb();
  await client.unsafe(`
    CREATE EXTENSION IF NOT EXISTS vector;
    CREATE TABLE IF NOT EXISTS dish_embedding (
      dish_id text PRIMARY KEY,
      name text,
      content text,
      embedding vector(${EMBEDDING_DIM}),
      updated_at timestamp DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS dish_embedding_hnsw
      ON dish_embedding USING hnsw (embedding vector_cosine_ops);
  `);
}

export async function upsertDishEmbedding(row: DishEmbeddingRow): Promise<void> {
  const { db } = getDb();
  await db
    .insert(dishEmbedding)
    .values(row)
    .onConflictDoUpdate({
      target: dishEmbedding.dishId,
      set: {
        name: row.name,
        content: row.content,
        embedding: row.embedding,
        updatedAt: new Date(),
      },
    });
}

export type EmbeddingMatch = { dishId: string; similarity: number };

/**
 * Cosine top-k over the dish vector store. Returns dish ids ranked by
 * similarity (1 = identical). Filters out weak matches below `minSimilarity`.
 */
export async function searchDishEmbeddings(
  queryEmbedding: number[],
  limit = 3,
  minSimilarity = 0.2
): Promise<EmbeddingMatch[]> {
  const { db } = getDb();
  const similarity = sql<number>`1 - (${cosineDistance(
    dishEmbedding.embedding,
    queryEmbedding
  )})`;

  return await db
    .select({ dishId: dishEmbedding.dishId, similarity })
    .from(dishEmbedding)
    .where(gt(similarity, minSimilarity))
    .orderBy(desc(similarity))
    .limit(limit);
}

export async function closeEmbeddingDb(): Promise<void> {
  if (clientSingleton) {
    await clientSingleton.end();
    clientSingleton = null;
    dbSingleton = null;
  }
}
