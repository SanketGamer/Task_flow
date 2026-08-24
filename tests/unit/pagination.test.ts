import { parsePaginationParams, toSkipTake, buildPaginationResult } from '../../src/utils/pagination';

describe('pagination helper', () => {
  it('defaults to page 1, limit 20 when query params are omitted', () => {
    expect(parsePaginationParams({})).toEqual({ page: 1, limit: 20 });
  });

  it('parses valid numeric strings from query params', () => {
    expect(parsePaginationParams({ page: '3', limit: '50' })).toEqual({ page: 3, limit: 50 });
  });

  it('falls back to defaults for non-numeric input instead of throwing', () => {
    expect(parsePaginationParams({ page: 'abc', limit: 'xyz' })).toEqual({ page: 1, limit: 20 });
  });

  it('falls back to defaults for non-integer input (e.g. "2.5")', () => {
    expect(parsePaginationParams({ page: '2.5' })).toEqual({ page: 1, limit: 20 });
  });

  it('clamps limit to the maximum of 100', () => {
    expect(parsePaginationParams({ limit: '999999' })).toEqual({ page: 1, limit: 100 });
  });

  it('clamps page below 1 up to 1', () => {
    expect(parsePaginationParams({ page: '-5' })).toEqual({ page: 1, limit: 20 });
  });

  it('computes correct skip/take for page 1', () => {
    expect(toSkipTake({ page: 1, limit: 20 })).toEqual({ skip: 0, take: 20 });
  });

  it('computes correct skip/take for page 3, limit 10', () => {
    expect(toSkipTake({ page: 3, limit: 10 })).toEqual({ skip: 20, take: 10 });
  });

  it('builds the required response envelope shape', () => {
    const result = buildPaginationResult(['a', 'b'], 42, { page: 2, limit: 20 });
    expect(result).toEqual({ data: ['a', 'b'], total: 42, page: 2, limit: 20 });
  });
});