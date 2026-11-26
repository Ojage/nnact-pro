import { z } from "zod";

/**
 * Removes `.default()` wrappers from a field so a missing key stays missing.
 * Optional and nullable wrappers are kept; only the default is dropped.
 */
function withoutDefault(field: z.ZodType): z.ZodType {
  if (field instanceof z.ZodDefault || field instanceof z.ZodPrefault) {
    return withoutDefault(field.unwrap() as z.ZodType);
  }
  if (field instanceof z.ZodOptional) return withoutDefault(field.unwrap() as z.ZodType).optional();
  if (field instanceof z.ZodNullable) return withoutDefault(field.unwrap() as z.ZodType).nullable();
  return field;
}

/**
 * The schema for a partial update (PATCH, sync update) built from a create
 * schema. Zod 4 changed `.partial()`: a field with `.default()` now gets its
 * default when the key is absent, so `{ title }` would also write
 * `status: "new"` and `total: 0` over the stored values. This strips the
 * defaults first, so only the keys the client sent come out of the parse,
 * which is how these routes behaved under zod 3.
 */
export function patchOf<Schema extends z.ZodObject>(schema: Schema): ReturnType<Schema["partial"]> {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(schema.shape)) shape[key] = withoutDefault(field as z.ZodType);
  // The result has the same type as `schema.partial()`: removing a default
  // only changes what happens when a key is absent, and every key is optional.
  return (schema as z.ZodObject).safeExtend(shape).partial() as ReturnType<Schema["partial"]>;
}
