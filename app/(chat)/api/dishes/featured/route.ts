import { getAllDishesForEmbedding } from "@/sanity/lib/dish-queries";
import { urlFor } from "@/sanity/lib/image";

export async function GET() {
  try {
    const all = await getAllDishesForEmbedding();
    // Prefer dishes that have a picture
    const withPic = all.filter((d) => d.picture);
    const source = withPic.length >= 3 ? withPic : all;
    
    // Shuffle the array to get random featured recipes
    const shuffled = [...source];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const featured = shuffled.slice(0, 3).map((d) => ({
      _id: d._id,
      name: d.name ?? null,
      category: d.category ?? null,
      backgroundText: d.backgroundText ?? null,
      pictureUrl: d.picture
        ? urlFor(d.picture).width(400).height(300).fit("crop").url()
        : null,
    }));

    return Response.json(featured);
  } catch (_error) {
    return Response.json([], { status: 200 });
  }
}
