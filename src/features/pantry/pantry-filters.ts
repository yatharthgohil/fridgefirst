/**
 * Pure pantry list filtering and sorting. Expiration status always comes from
 * backend metadata (see getExpiration); no urgency thresholds live here.
 */
import { getExpiration } from "./expiration-display";
import type { PantryItem, StorageLocation } from "./types";

export const STORAGE_LOCATIONS: StorageLocation[] = ["Fridge", "Freezer", "Pantry", "Counter"];

/** Expiration filters a user can toggle. Several selected = match any of them. */
export type ExpirationFilter = "expiring_soon" | "past" | "unknown";
export const EXPIRATION_FILTERS: { value: ExpirationFilter; label: string }[] = [
  { value: "expiring_soon", label: "Expiring soon" },
  { value: "past", label: "Past date" },
  { value: "unknown", label: "Unknown date" },
];

export type PantrySort = "expiration" | "added" | "name";
export const PANTRY_SORTS: { value: PantrySort; label: string }[] = [
  { value: "expiration", label: "Soonest expiration" },
  { value: "added", label: "Most recently added" },
  { value: "name", label: "Name (A–Z)" },
];

export interface PantryFilterState {
  query: string;
  expiration: ExpirationFilter[];
  location: StorageLocation | "all";
  sort: PantrySort;
}

export const DEFAULT_PANTRY_FILTERS: PantryFilterState = {
  query: "",
  expiration: [],
  location: "all",
  sort: "expiration",
};

/** True when any filter (not the sort order) narrows the list. */
export function hasActiveFilters(state: PantryFilterState): boolean {
  return state.query.trim() !== "" || state.expiration.length > 0 || state.location !== "all";
}

/** Clears filters but keeps the user's chosen sort order. */
export function clearPantryFilters(state: PantryFilterState): PantryFilterState {
  return { ...DEFAULT_PANTRY_FILTERS, sort: state.sort };
}

export function toggleExpirationFilter(state: PantryFilterState, value: ExpirationFilter): PantryFilterState {
  const selected = state.expiration.includes(value)
    ? state.expiration.filter((entry) => entry !== value)
    : [...state.expiration, value];
  return { ...state, expiration: selected };
}

function matchesQuery(item: PantryItem, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return item.name.toLowerCase().includes(needle) || item.location.toLowerCase().includes(needle);
}

function matchesBase(item: PantryItem, state: PantryFilterState): boolean {
  return matchesQuery(item, state.query) && (state.location === "all" || item.location === state.location);
}

function matchesExpiration(item: PantryItem, filters: ExpirationFilter[]): boolean {
  if (filters.length === 0) return true;
  const status = getExpiration(item).status;
  return filters.includes(status as ExpirationFilter);
}

/** Search AND location AND (any selected expiration filter). */
export function filterPantryItems(items: PantryItem[], state: PantryFilterState): PantryItem[] {
  return items.filter((item) => matchesBase(item, state) && matchesExpiration(item, state.expiration));
}

/**
 * Counts per expiration filter among items matching the search and location,
 * so each chip says how many results selecting it would contribute.
 */
export function countByExpirationFilter(
  items: PantryItem[],
  state: PantryFilterState,
): Record<ExpirationFilter, number> {
  const counts: Record<ExpirationFilter, number> = { expiring_soon: 0, past: 0, unknown: 0 };
  for (const item of items) {
    if (!matchesBase(item, state)) continue;
    const status = getExpiration(item).status;
    if (status in counts) counts[status as ExpirationFilter] += 1;
  }
  return counts;
}

function compareNameThenId(a: PantryItem, b: PantryItem): number {
  const byName = a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  if (byName !== 0) return byName;
  return String(a.id).localeCompare(String(b.id), "en", { numeric: true });
}

/** Contract order (EXPIRATION_SORT_RULE): date asc, unknown last, then name, then id. */
export function compareByExpiration(a: PantryItem, b: PantryItem): number {
  const dateA = getExpiration(a).date;
  const dateB = getExpiration(b).date;
  if (dateA !== dateB) {
    if (dateA === null) return 1;
    if (dateB === null) return -1;
    return dateA < dateB ? -1 : 1;
  }
  return compareNameThenId(a, b);
}

export function sortPantryItems(items: PantryItem[], sort: PantrySort): PantryItem[] {
  const sorted = [...items];
  if (sort === "name") return sorted.sort(compareNameThenId);
  if (sort === "added") return sorted.sort((a, b) => b.id - a.id);
  return sorted.sort(compareByExpiration);
}

export function applyPantryFilters(items: PantryItem[], state: PantryFilterState): PantryItem[] {
  return sortPantryItems(filterPantryItems(items, state), state.sort);
}
