"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type FeaturedDish = {
  _id: string;
  name: string | null;
  category: string | null;
  backgroundText: string | null;
  pictureUrl: string | null;
};

function Skeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm"
        >
          <div className="h-32 w-full bg-muted/40 animate-pulse" />
          <div className="flex flex-col gap-2 p-3">
            <div className="h-3 w-2/3 bg-muted/40 rounded animate-pulse" />
            <div className="h-2 w-full bg-muted/30 rounded animate-pulse" />
            <div className="h-2 w-4/5 bg-muted/30 rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function FeaturedDishes({
  onDishSelect,
}: {
  onDishSelect?: (name: string) => void;
}) {
  const [dishes, setDishes] = useState<FeaturedDish[] | null>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/dishes/featured`)
      .then((r) => r.json())
      .then((data: FeaturedDish[]) => setDishes(data))
      .catch(() => setDishes([]));
  }, []);

  if (dishes === null) return <Skeleton />;
  if (dishes.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {dishes.map((dish) => (
        <button
          type="button"
          onClick={() => onDishSelect?.(`How to make ${dish.name}`)}
          key={dish._id}
          className="flex text-left flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm hover:shadow-md transition-shadow duration-200 hover:-translate-y-0.5"
        >
          {/* Dish Image */}
          <div className="relative h-32 w-full bg-muted/30">
            {dish.pictureUrl ? (
              <Image
                src={dish.pictureUrl}
                alt={dish.name ?? "Dish"}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 100vw, 33vw"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <span className="text-4xl">🍲</span>
              </div>
            )}
          </div>

          {/* Dish Info */}
          <div className="flex flex-col gap-1 p-3 w-full">
            <div className="flex items-center justify-between w-full">
              <h3 className="font-semibold text-sm text-foreground truncate">
                {dish.name}
              </h3>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-amber-500 text-xs">★</span>
                <span className="text-xs text-muted-foreground">4.9</span>
              </div>
            </div>

            {dish.backgroundText && (
              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                {dish.backgroundText}
              </p>
            )}

            <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground/70">
              <span className="flex items-center gap-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                1 hour
              </span>
              <span className="flex items-center gap-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                6-8
              </span>
              {dish.category && (
                <span className="rounded-full bg-[#7C5432]/10 px-2 py-0.5 text-[10px] font-medium text-[#7C5432]">
                  {dish.category}
                </span>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
