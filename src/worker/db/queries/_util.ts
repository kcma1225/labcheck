// Build a partial UPDATE from a map of columns. `undefined` values are skipped
// (leave column unchanged); `null` is written as SQL NULL. Always bumps updated_at.
export function buildUpdate(
  table: string,
  fields: Record<string, unknown>,
  where: Record<string, unknown>,
): { sql: string; values: unknown[] } | null {
  const setKeys = Object.keys(fields).filter((k) => fields[k] !== undefined);
  if (setKeys.length === 0) return null;

  const setSql = [...setKeys.map((k) => `${k} = ?`), "updated_at = ?"].join(", ");
  const whereKeys = Object.keys(where);
  const whereSql = whereKeys.map((k) => `${k} = ?`).join(" AND ");

  const values = [
    ...setKeys.map((k) => fields[k]),
    Date.now(),
    ...whereKeys.map((k) => where[k]),
  ];

  return { sql: `UPDATE ${table} SET ${setSql} WHERE ${whereSql}`, values };
}
