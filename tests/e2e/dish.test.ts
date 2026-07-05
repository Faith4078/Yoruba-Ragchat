



import { expect, test } from "@playwright/test";

const PROJECT_ID = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "pjwcotmw";
const DATASET = process.env.NEXT_PUBLIC_SANITY_DATASET || "production";
const API_VERSION = process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2026-05-03";

// Discover a real dish that has a picture, so the test is not pinned to a
// single document id that could be deleted.
async function firstDishWithPicture(): Promise<{ id: string; name: string }> {
  const query =
    '*[_type=="yorubaDish" && defined(picture.asset)][0]{_id, name}';
  const url = `https://${PROJECT_ID}.api.sanity.io/v${API_VERSION}/data/query/${DATASET}?query=${encodeURIComponent(
    query
  )}`;
  const res = await fetch(url);
  const body = (await res.json()) as { result: { _id: string; name: string } };
  return { id: body.result._id, name: body.result.name };
}

test("dish page shows the picture image", async ({ page }) => {
  const dish = await firstDishWithPicture();

  await page.goto(`/dishes/${dish.id}`);

  // The picture is rendered as an <img> served from the Sanity image CDN.
  const picture = page.getByTestId("dish-picture");
  await expect(picture).toBeVisible();
  await expect(picture).toHaveAttribute("src", /cdn\.sanity\.io/);
});
