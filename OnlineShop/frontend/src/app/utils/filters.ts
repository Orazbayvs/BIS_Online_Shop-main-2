import { QueryParams } from '../services/api.service';

/** Removes empty values so only filters the person actually set are sent and counted. */
export function activeFilters(filters: Record<string, string | number | boolean | null | undefined>): QueryParams {
  const result: QueryParams = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === '' || value === null || value === undefined || value === false) continue;
    result[key] = typeof value === 'string' ? value.trim() : value;
  }
  return result;
}

/** Number of filters in use, ignoring the sort order (which always has a value). */
export function countActiveFilters(filters: QueryParams, ignore: string[] = ['ordering']): number {
  return Object.keys(filters).filter(key => !ignore.includes(key)).length;
}
