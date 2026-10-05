import { createHmac, timingSafeEqual } from "node:crypto";
import { embedDocuments } from "@/lib/ai/embeddings";
import {
  deleteDishEmbedding,
  upsertDishEmbedding,
} from "@/lib/db/embeddings";
import {
  dishEmbeddingText,
  getDishFresh,
  invalidateDishCache,
} from "@/sanity/lib/dish-queries";

/**
 * Automatic re-indexing. Sanity calls this endpoint whenever a Yoruba dish is
 * created, edited, or deleted, and we refresh that one dish's embedding so the
 * semantic search never goes stale.
 *
 * Sanity setup (manage.sanity.io > API > Webhooks):
 *   URL:        https://<your-domain>/api/sanity-webhook
 *   Filter:     _type == "yorubaDish"
 *   Projection: {_id}
 *   Trigger on: Create, Update, Delete
 *   Secret:     the same value as SANITY_WEBHOOK_SECRET
 */

const MAX_SIGNATURE_AGE_MS = 10 * 60 * 1000;

// Sanity signs `${timestamp}.${rawBody}` with HMAC-SHA256 and sends it as
// `sanity-webhook-signature: t=<timestamp>,v1=<base64url signature>`.
function isValidSignature(
  rawBody: string,
  header: string | null,
  secret: string
): boolean {
  if (!header) {
    return false;
  }

  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const index = part.indexOf("=");
      return [part.slice(0, index).trim(), part.slice(index + 1).trim()];
    })
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!(timestamp && signature)) {
    return false;
  }

  const age = Math.abs(Date.now() - Number(timestamp));
  if (!Number.isFinite(age) || age > MAX_SIGNATURE_AGE_MS) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("base64url");

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const secret = process.env.SANITY_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json(
      { error: "SANITY_WEBHOOK_SECRET is not configured" },
      { status: 500 }
    );
  }

  const rawBody = await request.text();
  if (
    !isValidSignature(
      rawBody,
      request.headers.get("sanity-webhook-signature"),
      secret
    )
  ) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let id: string | undefined;
  try {
    id = (JSON.parse(rawBody) as { _id?: string })._id;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!id) {
    return Response.json({ error: "Missing _id" }, { status: 400 });
  }

  // Drafts and published versions share an id apart from this prefix.
  const dishId = id.replace(/^drafts\./, "");

  try {
    // Make sure the next search re-reads Sanity too (this server instance only).
    invalidateDishCache();

    const dish = await getDishFresh(dishId);

    if (!dish) {
      await deleteDishEmbedding(dishId);
      return Response.json({ ok: true, action: "deleted", id: dishId });
    }

    const text = dishEmbeddingText(dish);
    const [embedding] = await embedDocuments([text]);
    await upsertDishEmbedding({
      dishId: dish._id,
      name: dish.name ?? null,
      content: text,
      embedding,
    });

    return Response.json({ ok: true, action: "indexed", id: dishId });
  } catch (error) {
    console.error("Sanity webhook re-index failed:", error);
    // A 500 makes Sanity retry the delivery automatically.
    return Response.json({ error: "Re-index failed" }, { status: 500 });
  }
}
