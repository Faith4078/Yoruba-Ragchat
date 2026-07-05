import type { InferUITool, UIMessage } from "ai";
import { z } from "zod";
import type { searchDishes } from "./ai/tools/search-dishes";

export const messageMetadataSchema = z.object({
  createdAt: z.string(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

type searchDishesTool = InferUITool<typeof searchDishes>;

export type ChatTools = {
  searchDishes: searchDishesTool;
};

export type DishCardData = {
  _id: string;
  name: string | null;
  category: string | null;
  picture: unknown;
  ingredients: unknown[];
};

export type CustomUIDataTypes = {
  "chat-title": string;
  dishes: DishCardData[];
};

export type ChatMessage = UIMessage<
  MessageMetadata,
  CustomUIDataTypes,
  ChatTools
>;

export type Attachment = {
  name: string;
  url: string;
  contentType: string;
};
