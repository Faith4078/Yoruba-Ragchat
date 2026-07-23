# Yoruba Ragchat (Ìlè Oúnjẹ)

A Retrieval Augmented Generation chatbot that teaches Yoruba cuisine. Every answer is grounded in a curated dish knowledge base managed in Sanity, so the assistant explains a dish's origin, ingredients, and preparation steps using only real, editor authored content, then shows the dish's picture and ingredient photos as a card beneath the reply.

Built with Next.js App Router, the Vercel AI SDK, Sanity, Neon Postgres (with pgvector), and Clerk.

## Table of contents

- [Features](#features)
- [How the RAG pipeline works](#how-the-rag-pipeline-works)
- [Content and data model](#content-and-data-model)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Populating the knowledge base](#populating-the-knowledge-base)
- [Scripts](#scripts)
- [Testing](#testing)
- [Deployment](#deployment)
- [License](#license)

## Features

- **Grounded chat**: answers are generated only from dishes retrieved from the knowledge base. The system prompt (`lib/ai/prompts.ts`) enforces strict scope matching (a "what is X" question gets a definition, not a full essay) and forbids inventing dishes, ingredients, or steps.
- **Hybrid retrieval**: dish search fuses lexical keyword matching with vector similarity search using Reciprocal Rank Fusion, so both exact name matches and semantically related queries surface the right dish.
- **Rich dish cards**: every retrieved dish renders as a card with its main picture and a horizontally scrollable ingredient carousel, both inline in the chat and at a standalone `/dishes/[id]` route.
- **Sanity Studio built in**: content editors manage dishes at `/studio` with no separate deployment, using a schema tailored to Yoruba dish data (name, category, picture, background, ingredients with photos, recipe, additional info).
- **Multiple models**: Gemini 2.5 Flash Lite is the default (served directly with your own free tier Gemini key), with Gemini 2.5 Flash and Pro, plus gateway routed models (DeepSeek, Mistral, Kimi K2.5, GPT OSS, Grok) available from the model picker.
- **Flexible auth**: anonymous visitors can chat immediately with nothing persisted; signing in with Clerk unlocks saved chat history, renaming, deleting, and resumable streams.
- **Guardrails**: hourly per user message entitlements, IP based rate limiting through Redis in production, and bot protection via Vercel BotID.
- **Composer slash commands**: `/new`, `/clear`, `/rename`, `/theme`, `/delete`, and `/purge` for quick chat management.

## How the RAG pipeline works

1. A user sends a message. `app/(chat)/api/chat/route.ts` inspects the text with a small heuristic to decide whether the question wants a single dish or a short list (words like "recommend", "list", "what soups do you have").
2. It calls `searchDishes` (`sanity/lib/dish-queries.ts`) to retrieve the relevant dish or dishes before generation starts, keeping each turn to a single model call, which matters for staying inside Gemini's free tier quota.
3. Retrieval itself is hybrid, combined with Reciprocal Rank Fusion (`k = 60`):
   - **Lexical leg**: diacritic insensitive keyword scoring over dish names and flattened content, with a stopword list and light plural stemming so "fritters" still matches "fritter".
   - **Semantic leg**: the query is embedded with Gemini (`gemini-embedding-001`, truncated to 768 dimensions) and compared against pre-computed dish embeddings stored in Neon Postgres via `pgvector`, ranked by cosine similarity.
   - If the vector store is empty or unreachable, retrieval falls back to the lexical leg alone.
4. The retrieved dish content (background, ingredients, recipe, additional info) is folded into the system prompt as the only source of truth, and `streamText` streams the answer back to the client.
5. The retrieved dishes are also written to the UI message stream as `data-dishes` events, which the client renders as `DishCard` components below the assistant's text.

An equivalent `searchDishes` AI SDK tool also exists at `lib/ai/tools/search-dishes.ts` for models that call tools directly; the main chat route currently performs retrieval itself instead of relying on tool calling, to guarantee exactly one model call per turn.

## Content and data model

**Sanity** (`sanity/schemaTypes/dishType.ts`) is the source of truth for dish content, document type `yorubaDish`:

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | required |
| `category` | string | e.g. soup, snack, swallow |
| `picture` | image | shown as the dish card's main photo |
| `background` | portable text | origin and cultural background |
| `ingredients` | array of objects | each with `name`, `quantity`, and an optional `image` |
| `recipe` | portable text | preparation steps |
| `additionalInfo` | portable text | anything else worth knowing |

**Neon Postgres** (via Drizzle ORM, `lib/db/schema.ts`) holds application data:

- `User`, `Chat`, `Message_v2`, `Vote_v2`, `Stream`: chat history, ownership, and resumable stream bookkeeping. Chats reference Clerk user ids directly rather than the legacy `User` table.
- `Document`, `Suggestion`: retained from the original template's document editor feature, unused by this RAG chat UI.

The same Postgres database also hosts a separate `dish_embedding` table (managed directly by `lib/db/embeddings.ts`, outside the Drizzle migrations) that stores one vector per dish for the semantic search leg. It is created and populated by the ingestion script described below.

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router, React Compiler, `cacheComponents`)
- [React 19](https://react.dev)
- [Vercel AI SDK v6](https://ai-sdk.dev) with [`@ai-sdk/google`](https://ai-sdk.dev/providers/ai-sdk-providers/google) for Gemini and the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) for other model providers
- [Sanity](https://www.sanity.io) as a headless CMS with an embedded Studio
- [Neon Serverless Postgres](https://neon.tech) with [Drizzle ORM](https://orm.drizzle.team) and [`pgvector`](https://github.com/pgvector/pgvector)
- [Clerk](https://clerk.com) for authentication
- [Redis](https://redis.io) (optional) for IP rate limiting and resumable stream state
- [Tailwind CSS v4](https://tailwindcss.com) with [shadcn/ui](https://ui.shadcn.com) and [Radix UI](https://radix-ui.com) primitives
- [Vercel Blob](https://vercel.com/storage/blob) for uploaded images, [Vercel BotID](https://vercel.com/docs/botid) for bot protection
- [Biome](https://biomejs.dev) / [Ultracite](https://www.ultracite.dev) for linting and formatting
- [Playwright](https://playwright.dev) for end to end tests

## Project structure

```
app/
  (chat)/                 chat UI routes, server actions, and API routes
    api/chat/              main streaming chat endpoint (POST/DELETE/PATCH)
    api/dishes/             lightweight dish name/category listing
    api/files/upload/       image upload endpoint (Vercel Blob)
    api/history, api/messages, api/vote, api/models
  dishes/[id]/             standalone page rendering a single dish card
  studio/[[...tool]]/      embedded Sanity Studio
components/
  chat/                    chat UI: messages, composer, sidebar, dish cards
  ai-elements/             reusable AI SDK UI primitives (conversation, tool, reasoning, etc.)
  ui/                      shadcn/ui component primitives
lib/
  ai/                      prompts, model catalog, providers, embeddings, RAG tool
  db/                      Drizzle schema, queries, migrations, vector store, ingestion script
  ratelimit.ts, errors.ts, constants.ts, types.ts, utils.ts
sanity/
  schemaTypes/dishType.ts  the yorubaDish content schema
  lib/dish-queries.ts      GROQ queries + hybrid search + Reciprocal Rank Fusion
  structure.ts, env.ts     Studio structure and environment resolution
tests/e2e/                 Playwright tests
proxy.ts                   Clerk middleware (exported as the Next.js middleware)
```

## Getting started

### Prerequisites

- Node.js and [pnpm](https://pnpm.io)
- A [Sanity](https://www.sanity.io) project and dataset
- A [Neon](https://neon.tech) (or any Postgres with the `vector` extension available) database
- A [Gemini API key](https://aistudio.google.com/apikey)
- A [Clerk](https://clerk.com) application

### Setup

1. Clone the repository and install dependencies:

   ```bash
   pnpm install
   ```

2. Create a `.env.local` file with the variables listed below.

3. Point `sanity.cli.ts` / `NEXT_PUBLIC_SANITY_PROJECT_ID` at your own Sanity project and dataset if you are not using the project's existing one.

4. Run the database migrations to create the chat and user tables:

   ```bash
   pnpm db:migrate
   ```

5. Add some dishes in Sanity Studio (see [Populating the knowledge base](#populating-the-knowledge-base)).

6. Start the dev server:

   ```bash
   pnpm dev
   ```

   The app runs at [localhost:3000](http://localhost:3000), and the Studio at [localhost:3000/studio](http://localhost:3000/studio).

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` (or `POSTGRES_URL`) | yes | Neon Postgres connection string; used for chat/user tables and the pgvector dish embedding store |
| `GEMINI_API_KEY` (or `GOOGLE_GENERATIVE_AI_API_KEY`) | yes | Gemini key for chat generation, title generation, and embeddings |
| `NEXT_PUBLIC_SANITY_PROJECT_ID` | yes | Sanity project id (falls back to the project's default if unset) |
| `NEXT_PUBLIC_SANITY_DATASET` | yes | Sanity dataset name (falls back to `production`) |
| `NEXT_PUBLIC_SANITY_API_VERSION` | no | Sanity API version (falls back to a pinned default) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | yes | Clerk publishable key |
| `CLERK_SECRET_KEY` | yes | Clerk secret key |
| `AI_GATEWAY_API_KEY` | only off Vercel | Needed to call the non-Gemini models through the Vercel AI Gateway when not deployed on Vercel (Vercel deployments authenticate automatically via OIDC) |
| `REDIS_URL` | no | Enables IP based rate limiting and resumable stream support in production; safely skipped in development |
| `BLOB_READ_WRITE_TOKEN` | no | Vercel Blob token for the image upload endpoint |
| `IS_DEMO` | no | Set to `1` to mount the app under a `/demo` base path |

Do not commit `.env.local`; it holds credentials for your AI, database, CMS, and auth providers.

## Populating the knowledge base

Dishes live in Sanity, not in the repository. To add or edit content:

1. Open `/studio` in the running app (or deploy the Studio with `pnpm deploy`).
2. Create or edit a "Yoruba Dish" document: name, category, picture, background, ingredients (each with its own optional photo), recipe, and additional info.
3. To power the semantic search leg, (re)build the vector index after content changes:

   ```bash
   pnpm tsx lib/db/embed-dishes.ts
   ```

   This script pulls every dish from Sanity, embeds it with Gemini, and upserts the vectors into the `dish_embedding` table in Neon. It needs `DATABASE_URL` and `GEMINI_API_KEY`. Skipping this step is fine; retrieval automatically falls back to lexical search only.

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the Next.js dev server (Turbopack) |
| `pnpm build` | Run pending DB migrations, then build for production |
| `pnpm start` | Start the production server |
| `pnpm deploy` | Deploy the Sanity Studio |
| `pnpm check` / `pnpm fix` | Lint (and autofix) with Ultracite/Biome |
| `pnpm db:generate` | Generate a Drizzle migration from schema changes |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:studio` | Open Drizzle Studio against your database |
| `pnpm db:push` / `pnpm db:pull` / `pnpm db:check` / `pnpm db:up` | Other Drizzle Kit commands |
| `pnpm test` | Run the Playwright end to end suite |

## Testing

End to end tests use Playwright (`tests/e2e/`) and run against a live Sanity dataset, fetching a real dish with a picture rather than pinning a fixed document id. Run them with:

```bash
pnpm test
```

## Deployment

The project deploys to Vercel (`vercel.json` sets `framework: nextjs`). The build script runs database migrations automatically before `next build`, so make sure `DATABASE_URL` is set on the deployment target. Sanity Studio is included in the same Next.js app at `/studio`, so no separate Studio hosting is required.

## License

Apache License 2.0, see [LICENSE](LICENSE). This project began from Vercel's open source AI Chatbot template and was adapted into a Yoruba cuisine RAG chatbot.
