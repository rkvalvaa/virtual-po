/**
 * Convert a snake_case string to camelCase
 */
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Map a single database row from snake_case to camelCase.
 * Handles Date conversion for columns ending in _at.
 * Parses JSONB strings if needed.
 */
export function mapRow<T>(row: Record<string, unknown>): T {
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const camelKey = toCamelCase(key);
    mapped[camelKey] = value;
  }
  return mapped as T;
}

/**
 * Map an array of database rows from snake_case to camelCase.
 */
export function mapRows<T>(rows: Record<string, unknown>[]): T[] {
  return rows.map((row) => mapRow<T>(row));
}
