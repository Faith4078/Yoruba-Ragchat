import { getAllDishesForEmbedding } from "@/sanity/lib/dish-queries";

export async function GET() {
  try {
    const dishes = await getAllDishesForEmbedding();

    const names = dishes
      .filter((dish) => Boolean(dish.name))
      .map((dish) => ({
        name: dish.name as string,
        category: dish.category ?? null,
      }));

    return Response.json(names, {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
      },
    });
  } catch (_error) {
    return Response.json([], { status: 200 });
  }
}
