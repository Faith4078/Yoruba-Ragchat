"use client";

import { GlobeIcon } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="flex items-center rounded-full border border-border/50 bg-muted/50 p-0.5">
      <button
        onClick={() => setLanguage("en")}
        className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
          language === "en"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        EN
      </button>
      <button
        onClick={() => setLanguage("yo")}
        className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
          language === "yo"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        YO
      </button>
      <button
        onClick={() => setLanguage("pcm")}
        className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
          language === "pcm"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        PCM
      </button>
    </div>
  );
}
