/**
 * Pure pantry list filtering and sorting. Urgency always comes from the
 * pantry API (see getExpirationInfo); no urgency thresholds live here.
 */
import type { Urgency } from "@/contracts/pantry";
import { getExpirationInfo } from "./expiration-display";
import type { PantryItem, StorageLocation } from "./types";

export const STORAGE_LOCATIONS: StorageLocation[] = ["Fridge", "Freezer", "Pantry", "Counter"];

/** Expiration filters a user can toggle. Several selected = match any of them. */
export type ExpirationFilter = "expiring_soon" | "past" | "unknown";

/** Which backend urgency kinds each filter shows ("later" has no filter). */
const FILTER_URGENCY: Record<ExpirationFilter, Urgency["kind"][]> = {
  expiring_soon: ["critical", "soon"],
  past: ["past_date"],
  unknown: ["unknown"],
};

function filterFor(kind: Urgency["kind"]): ExpirationFilter | null {
  for (const [filter, kinds] of Object.entries(FILTER_URGENCY)) {
    if (kinds.includes(kind)) return filter as ExpirationFilter;
  }
  return null;
}
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
  const filter = filterFor(getExpirationInfo(item).urgency.kind);
  return filter !== null && filters.includes(filter);
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
    const filter = filterFor(getExpirationInfo(item).urgency.kind);
    if (filter) counts[filter] += 1;
  }
  return counts;
}

function compareNameThenId(a: PantryItem, b: PantryItem): number {
  const byName = a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  if (byName !== 0) return byName;
  return compareIds(a, b);
}

function compareIds(a: PantryItem, b: PantryItem): number {
  const left = String(a.id);
  const right = String(b.id);
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Same order as the API's list (compareBySoonestExpiration in
 * src/server/modules/expiration/policy.ts): date ascending, unknown dates
 * last, ties by id. Keeps the order stable after local edits.
 */
export function compareByExpiration(a: PantryItem, b: PantryItem): number {
  const dateA = getExpirationInfo(a).expiration.date;
  const dateB = getExpirationInfo(b).expiration.date;
  if (dateA !== dateB) {
    if (dateA === null) return 1;
    if (dateB === null) return -1;
    return dateA < dateB ? -1 : 1;
  }
  return compareIds(a, b);
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
