"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { motion, AnimatePresence } from "framer-motion";
import type { ChatMessage } from "@/lib/types";
import { useLanguage } from "@/hooks/use-language";
import { FeaturedDishes } from "./featured-dishes";

type GreetingProps = {
  chatId: string;
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
};

const SUGGESTIONS = {
  en: [
    { label: "How to make Àdàlú", tag: "Popular", icon: "🍲" },
    { label: "Show me bean recipes", tag: "Ingredients", icon: "🫘" },
    { label: "Breakfast options", tag: "Meal Type", icon: "🌅" },
    { label: "Soups and stews", tag: "Category", icon: "🥘" },
    { label: "Plantain recipes", tag: "Popular", icon: "🍌" },
    { label: "Quick and easy dishes", tag: "Time", icon: "⚡" },
  ],
  yo: [
    { label: "Báwo ni a ṣe ń se Àdàlú", tag: "Gbajúmọ̀", icon: "🍲" },
    { label: "Fi àwọn oúnjẹ ẹ̀wà hàn mí", tag: "Èròjà", icon: "🫘" },
    { label: "Àwọn oúnjẹ àárọ̀", tag: "Irúfẹ́ Oúnjẹ", icon: "🌅" },
    { label: "Ọbẹ̀ àti ata dídín", tag: "Ìsọ̀rí", icon: "🥘" },
    { label: "Àwọn oúnjẹ ọ̀gẹ̀dẹ̀", tag: "Gbajúmọ̀", icon: "🍌" },
    { label: "Oúnjẹ kánkán", tag: "Àkókò", icon: "⚡" },
  ],
  pcm: [
    { label: "How to cook Àdàlú", tag: "Popular", icon: "🍲" },
    { label: "Show me beans recipes", tag: "Ingredients", icon: "🫘" },
    { label: "Food for morning", tag: "Food Type", icon: "🌅" },
    { label: "Soups and stews", tag: "Category", icon: "🥘" },
    { label: "Plantain recipes", tag: "Popular", icon: "🍌" },
    { label: "Fast and easy food", tag: "Time", icon: "⚡" },
  ]
};

const FEATURES = {
  en: [
    { label: "Authentic Recipes", emoji: "🫙" },
    { label: "AI-Powered Search", emoji: "🤖" },
    { label: "Instant Results", emoji: "⚡" },
  ],
  yo: [
    { label: "Oúnjẹ Ìbílẹ̀", emoji: "🫙" },
    { label: "Àwárí pẹ̀lú AI", emoji: "🤖" },
    { label: "Èsì Lẹ́sẹ̀kẹsẹ̀", emoji: "⚡" },
  ],
  pcm: [
    { label: "Correct Recipes", emoji: "🫙" },
    { label: "Search with AI", emoji: "🤖" },
    { label: "Fast Fast Results", emoji: "⚡" },
  ]
};

const TRANSLATIONS = {
  en: {
    welcome: "Ẹ káàbọ̀! Welcome! 👋",
    desc: "Discover the rich flavors of Yoruba cuisine with our AI-powered recipe assistant. I'll help you master traditional dishes.",
    featured: "Featured Recipes",
    tryAsking: "Try asking about...",
  },
  yo: {
    welcome: "Ẹ káàbọ̀! 👋",
    desc: "Ṣàwárí àwọn adùn oúnjẹ ilẹ̀ Yorùbá pẹ̀lú olùrànlọ́wọ́ wa ti AI. Màá ràn ẹ́ lọ́wọ́ láti mọ àwọn oúnjẹ ìbílẹ̀ wọ̀nyí dunjú.",
    featured: "Àwọn Oúnjẹ Tí A Yàn",
    tryAsking: "Gbìyànjú láti béèrè nípa...",
  },
  pcm: {
    welcome: "Welcome o! 👋",
    desc: "See different correct Yoruba food with our AI assistant. I go help you learn how to cook am.",
    featured: "Top Foods",
    tryAsking: "Try ask about...",
  }
};


export const Greeting = ({ chatId, sendMessage }: GreetingProps) => {
  const { language } = useLanguage();
  const lang = language as "en" | "yo" | "pcm";
  const t = TRANSLATIONS[lang] || TRANSLATIONS.en;
  
  const handleSuggestion = (text: string) => {
    window.history.pushState(
      {},
      "",
      `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/chat/${chatId}`
    );
    sendMessage({
      role: "user",
      parts: [{ type: "text", text }],
    });
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6 flex flex-col gap-6">
      <AnimatePresence mode="wait">
        <motion.div
          key={lang}
          initial="initial"
          animate="animate"
          exit="exit"
          variants={{
            initial: { opacity: 0 },
            animate: { opacity: 1, transition: { staggerChildren: 0.1 } },
            exit: { opacity: 0, transition: { staggerChildren: 0.05, staggerDirection: -1 } }
          }}
          className="flex flex-col gap-6 w-full"
        >
          {/* Hero Banner */}
          <motion.div
            variants={{
              initial: { opacity: 0, y: 16 },
              animate: { opacity: 1, y: 0 },
              exit: { opacity: 0, y: -16 }
            }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#8A4F1D] via-[#7C5432] to-[#4a2f0f] p-6 text-white shadow-lg"
          >
            {/* Decorative circles */}
            <div className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/5" />
            <div className="pointer-events-none absolute -bottom-6 -right-6 h-24 w-24 rounded-full bg-white/5" />

            <h1 className="text-2xl font-bold tracking-tight mb-1">
              {t.welcome}
            </h1>
            <p className="text-white/75 text-sm leading-relaxed max-w-lg">
              {t.desc}
            </p>

            <div className="flex flex-wrap gap-2 mt-4">
              {(FEATURES[lang] || FEATURES.en).map((feat) => (
                <span
                  key={feat.label}
                  className="flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm"
                >
                  <span>{feat.emoji}</span>
                  {feat.label}
                </span>
              ))}
            </div>
          </motion.div>

          {/* Featured Recipes */}
          <motion.div
            variants={{
              initial: { opacity: 0, y: 16 },
              animate: { opacity: 1, y: 0 },
              exit: { opacity: 0, y: -16 }
            }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <h2 className="flex items-center gap-2 font-semibold text-sm text-foreground mb-3">
              <span className="text-amber-500">★</span> {t.featured}
            </h2>
            <FeaturedDishes onDishSelect={handleSuggestion} />
          </motion.div>

          {/* Try Asking About */}
          <motion.div
            variants={{
              initial: { opacity: 0, y: 16 },
              animate: { opacity: 1, y: 0 },
              exit: { opacity: 0, y: -16 }
            }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm"
          >
            <h2 className="flex items-center gap-2 font-semibold text-sm text-foreground mb-3">
              <span>✨</span> {t.tryAsking}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(SUGGESTIONS[lang] || SUGGESTIONS.en).map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => handleSuggestion(s.label)}
                  className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/60 px-3 py-2.5 text-left transition-all duration-150 hover:border-[#7C5432]/30 hover:bg-[#7C5432]/5 hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0"
                >
                  <span className="text-xl shrink-0">{s.icon}</span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">
                      {s.label}
                    </p>
                    <p className="text-[11px] text-[#7C5432]">{s.tag}</p>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
