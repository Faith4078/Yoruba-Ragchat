import { type SchemaTypeDefinition } from 'sanity'
import dishType from './dishType'

export const schema: { types: SchemaTypeDefinition[] } = {
  types: [dishType],
}
