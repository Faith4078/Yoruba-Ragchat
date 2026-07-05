import { notFound } from "next/navigation";
import { Suspense } from "react";
import { type Dish, DishCard } from "@/components/chat/dish-card";
import { client } from "@/sanity/lib/client";

const DISH_QUERY = `*[_type == "yorubaDish" && _id == $id][0]{
  _id,
  name,
  category,
  picture,
  ingredients[]{ _key, name, quantity, image }
}`;

async function DishContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dish = await client.fetch<Dish | null>(DISH_QUERY, { id });

  if (!dish) {
    notFound();
  }

  return <DishCard dish={dish} />;
}

export default function DishPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <main className="min-h-dvh p-6">
      <Suspense
        fallback={<div className="text-muted-foreground">Loading dish…</div>}
      >
        <DishContent params={params} />
      </Suspense>
    </main>
  );
}
