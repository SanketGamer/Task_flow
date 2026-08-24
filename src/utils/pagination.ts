export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginationResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// Pagination params are optional query strings; a malformed value (e.g.
// ?page=abc) falls back to the default rather than 400ing the whole
// request — strict validation belongs to the zod layer for fields that
// truly must be well-formed, not to "page didn't parse as a number".

//means 2 - 20 rows
export function parsePaginationParams(query: { page?: unknown; limit?: unknown }): PaginationParams {
  return {
    page: clampInt(query.page, DEFAULT_PAGE, 1, Number.MAX_SAFE_INTEGER),
    // Capped at MAX_LIMIT so a client can't request ?limit=999999 and force
    // a full-table scan / huge payload.
    limit: clampInt(query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT),
  };
}

//if we want to go 2nd page (2-1)*20=20 so 20row is skipped
export function toSkipTake(params: PaginationParams): { skip: number; take: number } {
  return { skip: (params.page - 1) * params.limit, take: params.limit };
}

//it create the pagination responce
export function buildPaginationResult<T>(
  data: T[],
  total: number,
  params: PaginationParams
): PaginationResult<T> {
  return { data, total, page: params.page, limit: params.limit };
}

//This function makes sure the pagination value is a valid integer within a range."20"->20, "abc"->NAN
function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}