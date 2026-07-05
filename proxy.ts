import { clerkMiddleware } from "@clerk/nextjs/server";

// No routes are gated at the edge. Anonymous visitors can open a chat and talk
// to the model; the chat API simply skips database persistence for them. All
// write/history endpoints and server actions perform their own Clerk auth
// checks, and persistence is only wired up for signed-in users. We still run
// clerkMiddleware so `auth()` is available everywhere downstream.
const proxy = clerkMiddleware();

export default proxy;
export { proxy };

export const config = {
  matcher: [
    "/api/:path*",
    "/__clerk/:path*",
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
