"use client";

import type { SanityImageSource } from "@sanity/image-url";
import { urlFor } from "@/sanity/lib/image";

export type DishIngredient = {
  _key?: string;
  name?: string | null;
  quantity?: string | null;
  image?: SanityImageSource | null;
};

export type Dish = {
  _id: string;
  name?: string | null;
  category?: string | null;
  picture?: SanityImageSource | null;
  ingredients?: DishIngredient[] | null;
};

/**
 * Renders a Yoruba dish: the main picture "as is" plus its ingredients as a
 * horizontally scrollable carousel. Designed to be reused both on a standalone
 * dish route and inline inside a chat message (as the UI of a RAG dish tool).
 */
export function DishCard({ dish }: { dish: Dish }) {
  const pictureUrl = dish.picture
    ? urlFor(dish.picture).width(1200).height(800).fit("crop").url()
    : null;
  const ingredients = dish.ingredients ?? [];

  return (
    <article className="mx-auto flex w-full max-w-2xl flex-col gap-4 rounded-2xl border border-border bg-card p-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-xl">{dish.name}</h1>
        {dish.category ? (
          <p className="text-muted-foreground text-sm">{dish.category}</p>
        ) : null}
      </header>

      {pictureUrl ? (
        // Plain <img> (not next/image) so no cdn.sanity.io remotePattern is needed.
        // biome-ignore lint/performance/noImgElement: Sanity CDN already serves optimized images
        <img
          alt={dish.name ?? "Dish"}
          className="w-full rounded-xl object-cover"
          data-testid="dish-picture"
          src={pictureUrl}
        />
      ) : null}

      {ingredients.length > 0 ? (
        <section
          aria-label="Ingredients"
          className="flex snap-x gap-3 overflow-x-auto pb-2"
          data-testid="ingredients-carousel"
        >
          {ingredients.map((ingredient, index) => {
            const imageUrl = ingredient.image
              ? urlFor(ingredient.image).width(240).height(240).fit("crop").url()
              : null;
            return (
              <div
                className="flex w-40 shrink-0 snap-start flex-col gap-2 rounded-xl border border-border p-2"
                data-testid="ingredient-card"
                key={ingredient._key ?? index}
              >
                {imageUrl ? (
                  // biome-ignore lint/performance/noImgElement: Sanity CDN already serves optimized images
                  <img
                    alt={ingredient.name ?? "Ingredient"}
                    className="h-28 w-full rounded-lg object-cover"
                    data-testid="ingredient-image"
                    src={imageUrl}
                  />
                ) : null}
                <p className="font-medium text-sm">{ingredient.name}</p>
                {ingredient.quantity ? (
                  <p className="text-muted-foreground text-xs">
                    {ingredient.quantity}
                  </p>
                ) : null}
              </div>
            );
          })}
        </section>
      ) : null}
    </article>
  );
}
