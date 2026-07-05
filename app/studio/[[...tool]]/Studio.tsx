"use client";

/**
 * Client-only wrapper for Sanity Studio. NextStudio touches `window` when it
 * renders, so it must never run on the server — not during the build's static
 * prerender pass, nor at request-time SSR. We load it with `ssr: false` so it
 * only ever mounts in the browser. (Under Next's Cache Components mode the usual
 * `export const dynamic = 'force-dynamic'` route-segment escape hatch is not
 * allowed, which is why we opt out at the component boundary instead.)
 */
import dynamic from "next/dynamic";
import config from "../../../sanity.config";

const NextStudio = dynamic(
  () => import("next-sanity/studio").then((mod) => mod.NextStudio),
  { ssr: false }
);

export default function Studio() {
  return <NextStudio config={config} />;
}
