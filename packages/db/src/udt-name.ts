/**
 * Maps an application SQL type to the name Postgres reports as `udt_name` in
 * `information_schema.columns`.
 *
 * Two things stand between the SQL spelling a Drizzle column reports via
 * `getSQLType()` and the catalog name the database reports:
 *
 *  1. Some scalar types are named differently in the catalog (`boolean` is
 *     `bool`, `integer` is `int4`).
 *  2. Every array type is reported with a leading underscore on the element
 *     type: `uuid[]` is reported as `_uuid`, `text[]` as `_text`.
 *
 * Array types are handled by rule rather than enumerated one by one, so adding
 * a new array column cannot silently trip the parity check. The element type is
 * resolved first, because the underscore attaches to the catalog name of the
 * element: the array of `integer` is reported as `_int4`, not `_integer`. This
 * mirrors how Postgres names array types in `pg_type.typname`.
 */
const SCALAR_TYPE_TO_UDT: Record<string, string> = {
  boolean: "bool",
  integer: "int4",
  "timestamp with time zone": "timestamptz",
};

export function expectedUdtName(sqlType: string): string {
  if (sqlType.endsWith("[]")) return `_${expectedUdtName(sqlType.slice(0, -2))}`;
  return SCALAR_TYPE_TO_UDT[sqlType] ?? sqlType;
}
