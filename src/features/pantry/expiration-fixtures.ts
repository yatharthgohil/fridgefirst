/**
 * TEMPORARY demo data until AppShell loads items from GET /api/pantry (next
 * PR). Builds `expiration` results in the shape of src/contracts/pantry.ts and
 * gets `urgency` from the backend's own pure policy, so no urgency rule is
 * re-implemented here. Delete this file once the dashboard uses the API.
 */
import type { CalendarDate } from "@/contracts/common";
import type { ExpirationProvenance, ExpirationResult } from "@/contracts/pantry";
import { expirationUrgency } from "@/server/modules/expiration/policy";
import type { ExpirationInfo, PantryItem } from "./types";

/** The dashboard mock data is written as if today were this date. */
export const FIXTURE_TODAY: CalendarDate = "2025-05-19";

const DEMO_SOURCE = {
  sourceName: "Demo data (not food guidance)",
  sourceUrl: "https://example.com/fridgefirst-demo",
  sourceAccessedOn: "2025-05-01",
} as const;

const DEMO_REFERENCES: Record<string, { foodName: string; days: number; assumptions: string }> = {
  leaf: { foodName: "Leafy greens", days: 6, assumptions: "Unwashed, refrigerated in original packaging." },
  yogurt: { foodName: "Yogurt", days: 10, assumptions: "Unopened, refrigerated." },
  broccoli: { foodName: "Broccoli", days: 7, assumptions: "Whole heads, refrigerated." },
  chickpeas: { foodName: "Canned beans", days: 365, assumptions: "Unopened can, cool and dry." },
  apple: { foodName: "Apples", days: 21, assumptions: "Whole fruit." },
};

function demoProvenance(item: PantryItem): ExpirationProvenance {
  const reference = DEMO_REFERENCES[item.icon] ?? { foodName: item.name, days: 7, assumptions: "Typical storage." };
  return {
    referenceId: "00000000-0000-4000-8000-000000000999",
    storageLocation: item.location,
    ...reference,
    ...DEMO_SOURCE,
  };
}

export function fixtureInfo(expiration: ExpirationResult, today: CalendarDate = FIXTURE_TODAY): ExpirationInfo {
  return { expiration, urgency: expirationUrgency(expiration, today) };
}

/** Attaches an estimate (or unknown) to a mock item, as the API would on load. */
export function withFixtureExpiration(item: PantryItem, today: CalendarDate = FIXTURE_TODAY): PantryItem {
  if (item.expirationInfo) return item;
  const expiration: ExpirationResult = item.expirationDate
    ? { kind: "estimate", date: item.expirationDate, provenance: demoProvenance(item) }
    : { kind: "unknown", date: null, reason: "no_match" };
  return { ...item, expirationInfo: fixtureInfo(expiration, today) };
}

/**
 * Mirrors the API's handling of an edit (docs/backend-expiration.md): a changed
 * date becomes an override, a cleared date becomes unknown/user_cleared, and
 * an unchanged date keeps its current result.
 */
export function applyFixtureExpirationEdit(
  previous: PantryItem,
  updated: PantryItem,
  today: CalendarDate = FIXTURE_TODAY,
): PantryItem {
  const date = updated.expirationDate || null;
  const current = previous.expirationInfo?.expiration;
  if (current && date === current.date) return { ...updated, expirationInfo: previous.expirationInfo };
  const expiration: ExpirationResult =
    date === null ? { kind: "unknown", date: null, reason: "user_cleared" } : { kind: "override", date };
  return { ...updated, expirationInfo: fixtureInfo(expiration, today) };
}

const base = { expiry: "", urgency: "fresh", amount: 80, quantity: "1" } as const;

/** Extra demo items covering the date states the base mock data lacks. */
export const expirationFixtureItems: PantryItem[] = [
  { ...base, id: 101, name: "Leftover chili", quantity: "2", unit: "portion", location: "Fridge", expirationDate: "", icon: "chickpeas", added: "May 17" },
  { ...base, id: 102, name: "Sour cream", quantity: "0.5", unit: "tub", location: "Fridge", expirationDate: "2025-05-17", icon: "yogurt", added: "May 6" },
  {
    ...base, id: 103, name: "Hummus", unit: "tub", location: "Fridge", expirationDate: "2025-05-21", icon: "chickpeas", added: "May 15",
    expirationInfo: fixtureInfo({ kind: "override", date: "2025-05-21" }),
  },
  {
    ...base, id: 104, name: "Fresh basil", unit: "bunch", location: "Counter", expirationDate: "2025-05-18", icon: "leaf", added: "May 14",
    expirationInfo: fixtureInfo({ kind: "override", date: "2025-05-18" }),
  },
  {
    ...base, id: 105, name: "Cooked rice", unit: "portion", location: "Fridge", expirationDate: "", icon: "chickpeas", added: "May 16",
    expirationInfo: fixtureInfo({ kind: "unknown", date: null, reason: "user_cleared" }),
  },
];
