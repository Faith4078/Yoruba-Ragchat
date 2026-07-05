import { defineArrayMember, defineField, defineType } from "sanity";

// Matches the fields the app's GROQ queries read (sanity/lib/dish-queries.ts):
// name, category, picture, background/recipe/additionalInfo (portable text),
// ingredients[]{ name, quantity, image }.
const dishType = defineType({
  name: "yorubaDish",
  title: "Yoruba Dish",
  type: "document",
  fields: [
    defineField({
      name: "name",
      title: "Name",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "category",
      title: "Category",
      type: "string",
    }),
    defineField({
      name: "picture",
      title: "Picture",
      type: "image",
      options: { hotspot: true },
    }),
    defineField({
      name: "background",
      title: "Background & Origin",
      type: "array",
      of: [defineArrayMember({ type: "block" })],
    }),
    defineField({
      name: "ingredients",
      title: "Ingredients",
      type: "array",
      of: [
        defineArrayMember({
          type: "object",
          name: "ingredient",
          fields: [
            defineField({ name: "name", title: "Name", type: "string" }),
            defineField({ name: "quantity", title: "Quantity", type: "string" }),
            defineField({
              name: "image",
              title: "Image",
              type: "image",
              options: { hotspot: true },
            }),
          ],
        }),
      ],
    }),
    defineField({
      name: "recipe",
      title: "Recipe / Preparation",
      type: "array",
      of: [defineArrayMember({ type: "block" })],
    }),
    defineField({
      name: "additionalInfo",
      title: "Additional Info",
      type: "array",
      of: [defineArrayMember({ type: "block" })],
    }),
  ],
});

export default dishType;
