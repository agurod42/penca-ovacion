import type { Page } from './types.js';

export interface PaginateOptions {
  /** Page size passed to the fetcher; also used to detect the last page. */
  limit?: number;
  /** First page number (the API is 1-indexed). */
  startPage?: number;
  /** Safety cap on total pages fetched. */
  maxPages?: number;
}

/**
 * Async iterator over a 1-indexed, `{ data, hasMore? }`-style paginated endpoint.
 *
 * Stops when the server reports `hasMore === false`, when a page returns fewer
 * items than `limit`, or when `maxPages` is reached.
 *
 * @example
 * for await (const post of paginate((p) => client.wall.posts({ page: p, limit: 20 }), { limit: 20 })) {
 *   console.log(post.content);
 * }
 */
export async function* paginate<T>(
  fetchPage: (page: number) => Promise<Page<T>>,
  options: PaginateOptions = {},
): AsyncGenerator<T, void, void> {
  const limit = options.limit ?? 20;
  const maxPages = options.maxPages ?? 1000;
  let page = options.startPage ?? 1;
  let fetched = 0;

  while (fetched < maxPages) {
    const result = await fetchPage(page);
    const items = result.data ?? [];
    for (const item of items) yield item;
    fetched += 1;

    const hasMoreFlag = result.hasMore;
    if (hasMoreFlag === false) return;
    if (hasMoreFlag === undefined && items.length < limit) return;
    if (items.length === 0) return;
    page += 1;
  }
}

/** Collect an async iterator into an array (with an optional cap). */
export async function collect<T>(
  iter: AsyncGenerator<T>,
  max = Number.POSITIVE_INFINITY,
): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iter) {
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}
