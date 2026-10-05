import { embedQuery } from "./lib/ai/embeddings";
import { searchDishEmbeddings } from "./lib/db/embeddings";

async function main() {
  const queryEmbedding = await embedQuery("snack");
  const matches = await searchDishEmbeddings(queryEmbedding, 5, 0.65);
  console.log(matches);
}
main();
