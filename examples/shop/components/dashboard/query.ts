export type SearchParams = Record<string, string | string[] | undefined>;

export function toSearchParams(params: SearchParams): URLSearchParams {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((item) => search.append(key, item));
    else if (value !== undefined) search.set(key, value);
  }
  return search;
}

/**
 * `path?query` with `changes` applied (`null` removes a param). Changing anything other
 * than the page resets pagination, so results never start on a page that no longer exists.
 */
export function hrefWith(path: string, current: URLSearchParams, changes: Record<string, string | null>): string {
  const next = new URLSearchParams(current);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
  }
  // A cursor belongs to the query that produced it, so changing anything else drops it.
  if (!("page" in changes)) next.delete("page");
  if (!("cursor" in changes)) next.delete("cursor");
  const query = next.toString();
  return query ? `${path}?${query}` : path;
}
