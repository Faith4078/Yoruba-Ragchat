"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { cn } from "@/lib/utils";

type DishSummary = {
  name: string;
  category?: string | null;
};

const TEMPLATES: ((dishName: string) => { label: string; query: string })[] = [
  (dishName) => ({
    label: `Did you know about ${dishName}?`,
    query: `Did you know about ${dishName}? Tell me what makes it special.`,
  }),
  (dishName) => ({
    label: `How is ${dishName} prepared?`,
    query: `How is ${dishName} prepared?`,
  }),
  (dishName) => ({
    label: `${dishName} — what are its ingredients?`,
    query: `What are the ingredients of ${dishName}?`,
  }),
  (dishName) => ({
    label: `Where did ${dishName} originate from?`,
    query: `Where did ${dishName} originate from? Tell me its background and how it's prepared.`,
  }),
];

const ROTATE_INTERVAL_MS = 4500;
const FADE_MS = 400;

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function PureRotatingDishSuggestions({
  hidden,
  onSelect,
}: {
  /** Hide while the user is typing or the assistant is responding. */
  hidden: boolean;
  onSelect: (query: string) => void;
}) {
  const { data: dishes } = useSWR<DishSummary[]>(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/dishes`,
    (url: string) => fetch(url).then((r) => r.json()),
    { revalidateOnFocus: false, dedupingInterval: 300_000 }
  );

  // Shuffled dish × template combinations, computed once per dish payload.
  const prompts = useMemo(() => {
    if (!Array.isArray(dishes) || dishes.length === 0) {
      return [];
    }
    return shuffle(
      dishes.flatMap((dish) => TEMPLATES.map((template) => template(dish.name)))
    );
  }, [dishes]);

  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const [paused, setPaused] = useState(false);
  const fadeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (prompts.length < 2 || hidden || paused) {
      return;
    }
    const interval = setInterval(() => {
      setVisible(false);
      fadeTimeout.current = setTimeout(() => {
        setIndex((i) => (i + 1) % prompts.length);
        setVisible(true);
      }, FADE_MS);
    }, ROTATE_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      if (fadeTimeout.current) {
        clearTimeout(fadeTimeout.current);
      }
      setVisible(true);
    };
  }, [prompts.length, hidden, paused]);

  if (prompts.length === 0 || hidden) {
    return null;
  }

  const prompt = prompts[index % prompts.length];

  return (
    <div
      className="pointer-events-none flex h-6 items-center overflow-hidden px-1"
      data-testid="rotating-dish-suggestions"
    >
      <button
        className={cn(
          "pointer-events-auto max-w-full cursor-pointer truncate rounded-lg px-2 py-0.5 text-left text-[12px] text-muted-foreground/60 transition-opacity duration-400 ease-in-out hover:bg-muted/60 hover:text-foreground",
          visible ? "opacity-100" : "opacity-0"
        )}
        onBlur={() => setPaused(false)}
        onClick={() => onSelect(prompt.query)}
        onFocus={() => setPaused(true)}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        style={{ transitionDuration: `${FADE_MS}ms` }}
        type="button"
      >
        {prompt.label}
      </button>
    </div>
  );
}

export const RotatingDishSuggestions = memo(PureRotatingDishSuggestions);
