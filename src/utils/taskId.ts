/**
 * Generate a task id using the same algorithm as the Tasks plugin's own
 * `generateUniqueId` (base-36, 6 characters, retried against `existingIds`
 * until unique) — so ids this plugin mints are indistinguishable from ones
 * Tasks itself would have written.
 */
export function generateTaskId(existingIds: readonly string[]): string {
  const known = new Set(existingIds);
  let id: string;
  do {
    id = Math.random().toString(36).slice(2, 8);
  } while (known.has(id));
  return id;
}

/**
 * Restrict a task id to characters safe to use as a filename component
 * (letters, digits, `_`, `-`), preventing path traversal or writes outside
 * the intended folder when an id is used to build a file path. Returns null
 * if nothing safe remains (e.g. an id that was entirely path separators).
 */
export function sanitizeTaskId(id: string): string | null {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 100);
  return safe.length > 0 ? safe : null;
}
