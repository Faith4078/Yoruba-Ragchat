import type { SanityImageSource } from "@sanity/image-url";
import { client } from "./client";

export type RetrievedIngredient = {
  _key?: string;
  name?: string | null;
  quantity?: string | null;
  image?: SanityImageSource | null;
};

export type RetrievedDish = {
  _id: string;
  name?: string | null;
  category?: string | null;
  picture?: SanityImageSource | null;
  backgroundText?: string;
  recipeText?: string;
  additionalInfoText?: string;
  ingredients?: RetrievedIngredient[] | null;
};

// Portable-text fields are flattened server-side with pt::text() so we can use
// them as plain strings. Images are kept as raw refs for <DishCard>.
const ALL_DISHES_QUERY = `*[_type == "yorubaDish"]{
  _id,
  name,
  category,
  picture,
  "backgroundText": pt::text(background),
  "recipeText": pt::text(recipe),
  "additionalInfoText": pt::text(additionalInfo),
  ingredients[]{ _key, name, quantity, image }
}`;

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { at: number; dishes: RetrievedDish[] } | null = null;

async function getAllDishes(): Promise<RetrievedDish[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.dishes;
  }
  const dishes = await client.fetch<RetrievedDish[]>(ALL_DISHES_QUERY);
  cache = { at: Date.now(), dishes: dishes ?? [] };
  return cache.dishes;
}

export async function getDishById(id: string): Promise<RetrievedDish | null> {
  const dishes = await getAllDishes();
  return dishes.find((dish) => dish._id === id) ?? null;
}

async function getDishesByIds(ids: string[]): Promise<RetrievedDish[]> {
  const dishes = await getAllDishes();
  const byId = new Map(dishes.map((dish) => [dish._id, dish]));
  // Preserve the incoming (ranked) order and drop any ids no longer in Sanity.
  return ids
    .map((id) => byId.get(id))
    .filter((dish): dish is RetrievedDish => dish !== undefined);
}

/**
 * The canonical text used to embed a dish. Kept here so ingestion and any
 * future re-embedding produce identical documents.
 */
export function dishEmbeddingText(dish: RetrievedDish): string {
  const ingredients = (dish.ingredients ?? [])
    .map((ing) =>
      [ing.name, ing.quantity].filter(Boolean).join(" — ")
    )
    .filter(Boolean)
    .join("\n");

  return [
    dish.name && `Dish: ${dish.name}`,
    dish.category && `Category: ${dish.category}`,
    dish.backgroundText && `Background: ${dish.backgroundText}`,
    ingredients && `Ingredients:\n${ingredients}`,
    dish.recipeText && `Recipe: ${dish.recipeText}`,
    dish.additionalInfoText && `More: ${dish.additionalInfoText}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function getAllDishesForEmbedding(): Promise<RetrievedDish[]> {
  return await getAllDishes();
}

// ---- Keyword retrieval (one leg of the hybrid search; also the sole leg if
// the vector store is unavailable) ----

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function countOccurrences(haystack: string, term: string): number {
  return term ? haystack.split(term).length - 1 : 0;
}

type RankedId = { id: string; rank: number };

/**
 * Convert score-ordered entries to competition ranks ("1224"): entries with
 * equal scores share a rank. Without this, arbitrary ordering among ties would
 * feed fake precision into RRF and could outvote a clear winner from the
 * other leg.
 */
function toCompetitionRanks(
  entries: { id: string; score: number }[]
): RankedId[] {
  const sorted = [...entries].sort((a, b) => b.score - a.score);
  let rank = 0;
  return sorted.map((entry, index) => {
    if (index === 0 || entry.score < sorted[index - 1].score) {
      rank = index + 1;
    }
    return { id: entry.id, rank };
  });
}

// Question words and generic cooking terms that appear in virtually every
// dish's text. Left in, they add noise that can outvote the semantic leg;
// they carry no signal about WHICH dish is meant.
const KEYWORD_STOPWORDS = new Set([
  "how", "what", "where", "when", "why", "who", "which", "did", "does", "the",
  "and", "for", "with", "about", "tell", "know", "you", "your", "have", "has",
  "prepare", "prepared", "preparation", "make", "made", "making", "cook",
  "cooked", "cooking", "recipe", "recipes", "ingredient", "ingredients",
  "step", "steps", "originate", "originated", "origin", "come", "from",
  "food", "foods", "dish", "dishes", "meal", "meals", "eat", "eaten", "list",
]);

/** Ranked dish ids from lexical scoring: name hits weigh most, body mentions capped. */
function keywordRank(dishes: RetrievedDish[], query: string): RankedId[] {
  // Crude plural stemming ("fritters" → "fritter") so plural queries still
  // match singular text; `name.includes(stem)` keeps prefix matching intact.
  const terms = Array.from(
    new Set(
      normalize(query)
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 2 && !KEYWORD_STOPWORDS.has(t))
        .map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t))
    )
  );
  if (terms.length === 0) {
    return [];
  }

  const scored = dishes
    .map((dish) => {
      const name = normalize(dish.name ?? "");
      const rest = normalize(dishEmbeddingText(dish));
      let score = 0;
      for (const term of terms) {
        if (name.includes(term)) {
          score += 6;
        }
        score += Math.min(countOccurrences(rest, term), 3);
      }
      return { id: dish._id, score };
    })
    .filter((entry) => entry.score > 0);

  return toCompetitionRanks(scored);
}

// Reciprocal Rank Fusion constant. 60 is the standard from the original RRF
// paper; it damps the gap between rank 1 and rank 2 so one leg can't dominate.
const RRF_K = 60;

function reciprocalRankFusion(rankings: RankedId[][]): string[] {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    for (const { id, rank } of ranking) {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + rank));
    }
  }
  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
}

/**
 * Hybrid retrieval with Reciprocal Rank Fusion:
 * - Semantic leg: embed the query (Gemini) and rank dishes by pgvector cosine
 *   similarity in Neon.
 * - Lexical leg: keyword scoring over dish names and flattened content
 *   (diacritic-insensitive, so "ekuru" still matches "Èkúrú").
 * Both rankings are fused with RRF (score = Σ 1/(k + rank)), then the top ids
 * are hydrated with full dish content from Sanity. If the vector store is
 * unreachable or empty, the lexical ranking alone is used.
 */
export async function searchDishes(
  query: string,
  limit = 3
): Promise<RetrievedDish[]> {
  const dishes = await getAllDishes();
  // Rank deeper than `limit` in each leg so fusion has real overlap to work with.
  const candidateDepth = Math.max(limit * 4, 10);

  const keywordRanking = keywordRank(dishes, query).slice(0, candidateDepth);

  let vectorRanking: RankedId[] = [];
  try {
    const { embedQuery } = await import("@/lib/ai/embeddings");
    const { searchDishEmbeddings } = await import("@/lib/db/embeddings");

    const queryEmbedding = await embedQuery(query);
    const matches = await searchDishEmbeddings(queryEmbedding, candidateDepth);
    vectorRanking = toCompetitionRanks(
      matches.map((m) => ({ id: m.dishId, score: m.similarity }))
    );
  } catch (_error) {
    // Vector store not provisioned yet or unreachable — lexical leg only.
  }

  const fusedIds = reciprocalRankFusion(
    [vectorRanking, keywordRanking].filter((r) => r.length > 0)
  );

  const ranked = await getDishesByIds(fusedIds);
  return ranked.length > 0 ? ranked.slice(0, limit) : dishes.slice(0, limit);
}
