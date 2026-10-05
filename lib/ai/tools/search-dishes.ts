import { tool } from "ai";
import { z } from "zod";
import { searchDishes as retrieveDishes } from "@/sanity/lib/dish-queries";

/**
 * RAG retrieval tool. The model calls this to ground its answers in the Yoruba
 * dish knowledge base (Sanity). The returned dishes carry both the text the
 * model reads and the image refs the UI renders via <DishCard>.
 */
export const searchDishes = tool({
  description:
    "Search the Yoruba dish knowledge base. ALWAYS call this before answering any question about Yoruba dishes, their history/background, ingredients, or how to cook them — including open-ended recommendation questions like 'what can I cook for breakfast' or 'recommend a soup'. Never claim a dish doesn't exist without calling this first. Returns the most relevant dishes with their background, ingredients, recipe, and images. Base your answer only on what this returns.",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "The dish name or a description of what the user is asking about, e.g. 'Èkúrú', 'spicy bean pudding', 'how to make egusi'."
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(6)
      .optional()
      .describe(
        "How many dishes to return. Use 1 (the default) when the user asks about ONE specific dish — this returns only that dish so the UI shows a single card. Use 4-6 only for 'recommend me a dish', 'list the snacks', 'what soups do you have' style requests that expect several options."
      ),
  }),
  execute: async ({ query, limit }) => {
    const dishes = await retrieveDishes(query, limit ?? 1);

    // Field names here must match the `Dish` type in components/chat/dish-card.tsx
    // (history / regionalVariations / cookingInstructions), not the raw Sanity
    // field names (backgroundText / recipeText / additionalInfoText) — the card
    // silently renders nothing for fields it doesn't recognize.
    return {
      dishes: dishes.map((dish) => ({
        _id: dish._id,
        name: dish.name ?? null,
        category: dish.category ?? null,
        picture: dish.picture ?? null,
        ingredients: dish.ingredients ?? [],
        history: dish.backgroundText ?? null,
        regionalVariations: dish.additionalInfoText ?? null,
        cookingInstructions: dish.recipeText
          ? dish.recipeText.split("\n").filter((s) => s.trim())
          : null,
      })),
    };
  },
});
