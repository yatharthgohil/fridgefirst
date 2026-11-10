/**
 * FIXTURE ONLY — stands in for the backend expiration/urgency module until it
 * exists. It produces `ExpirationMeta` exactly as the contract describes so
 * the badges and filters can be built and tested now. The threshold and
 * reference table below are placeholders; the real rules (team decision,
 * PROJECT_CONTEXT.md §9/§17) belong to the backend. Delete this file's use in
 * AppShell once pantry items arrive from the API with `expiration` attached.
 */
import type { ExpirationMeta, ExpirationSource, ShelfLifeReferenceSummary } from "@/contracts/expiration";
import type { PantryItem } from "./types";

/** The dashboard mock data is written as if today were this date. */
export const FIXTURE_TODAY = "2025-05-19";
/** Placeholder: matches the dashboard's existing "soon" tier (≤ 4 days). */
const FIXTURE_EXPIRING_SOON_DAYS = 4;

const FIXTURE_REFERENCES: Record<string, Omit<ShelfLifeReferenceSummary, "storage">> = {
  leaf: { name: "Leafy greens", shelfLifeDays: 6 },
  yogurt: { name: "Yogurt", shelfLifeDays: 10 },
  broccoli: { name: "Broccoli", shelfLifeDays: 7 },
  chickpeas: { name: "Canned beans", shelfLifeDays: 365 },
  apple: { name: "Apples", shelfLifeDays: 21 },
};

function dayNumber(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

export function buildFixtureExpiration(
  date: string | null,
  source: Exclude<ExpirationSource, "unknown">,
  options: { today?: string; reference?: ShelfLifeReferenceSummary | null; overriddenAt?: string | null } = {},
): ExpirationMeta {
  if (!date || Number.isNaN(dayNumber(date))) {
    return { date: null, source: "unknown", status: "unknown", daysUntil: null, reference: null };
  }
  const daysUntil = Math.round(dayNumber(date) - dayNumber(options.today ?? FIXTURE_TODAY));
  const status = daysUntil < 0 ? "past" : daysUntil <= FIXTURE_EXPIRING_SOON_DAYS ? "expiring_soon" : "ok";
  return {
    date,
    source,
    status,
    daysUntil,
    reference: source === "estimated" ? options.reference ?? null : null,
    overriddenAt: source === "override" ? options.overriddenAt ?? null : null,
  };
}

function referenceFor(item: PantryItem): ShelfLifeReferenceSummary | null {
  const reference = FIXTURE_REFERENCES[item.icon];
  return reference ? { ...reference, storage: item.location } : null;
}

/** Attaches estimated (or unknown) expiration metadata, as the backend would on load. */
export function withFixtureExpiration(item: PantryItem, today: string = FIXTURE_TODAY): PantryItem {
  if (item.expiration) return item;
  return {
    ...item,
    expiration: buildFixtureExpiration(item.expirationDate || null, "estimated", { today, reference: referenceFor(item) }),
  };
}

/**
 * Mirrors the backend's handling of an item edit: a changed date becomes a
 * user override (or unknown when cleared); otherwise the source is kept.
 */
export function applyFixtureExpirationEdit(
  previous: PantryItem,
  updated: PantryItem,
  options: { today?: string; now?: Date } = {},
): PantryItem {
  const date = updated.expirationDate || null;
  const before = previous.expiration;
  const dateChanged = date !== (previous.expirationDate || null);
  const locationChanged = updated.location !== previous.location;

  let expiration: ExpirationMeta;
  if (!dateChanged && before && before.source === "override") {
    expiration = buildFixtureExpiration(date, "override", { today: options.today, overriddenAt: before.overriddenAt });
  } else if (!dateChanged && !locationChanged && before) {
    expiration = before;
  } else if (!dateChanged) {
    // Storage moved: the backend re-estimates using the new storage condition.
    expiration = buildFixtureExpiration(date, "estimated", { today: options.today, reference: referenceFor(updated) });
  } else {
    expiration = buildFixtureExpiration(date, "override", {
      today: options.today,
      overriddenAt: (options.now ?? new Date()).toISOString(),
    });
  }
  return { ...updated, expiration };
}

/** Extra dashboard items covering the date states the base mock data lacks. */
export const expirationFixtureItems: PantryItem[] = [
  { id: 101, name: "Leftover chili", quantity: "2", unit: "portion", location: "Fridge", expirationDate: "", expiry: "", urgency: "fresh", icon: "chickpeas", amount: 70, added: "May 17" },
  { id: 102, name: "Sour cream", quantity: "0.5", unit: "tub", location: "Fridge", expirationDate: "2025-05-17", expiry: "", urgency: "critical", icon: "yogurt", amount: 40, added: "May 6" },
  {
    id: 103, name: "Hummus", quantity: "1", unit: "tub", location: "Fridge", expirationDate: "2025-05-21", expiry: "", urgency: "soon", icon: "chickpeas", amount: 90, added: "May 15",
    expiration: buildFixtureExpiration("2025-05-21", "override", { overriddenAt: "2025-05-15T18:20:00.000Z" }),
  },
  {
    id: 104, name: "Fresh basil", quantity: "1", unit: "bunch", location: "Counter", expirationDate: "2025-05-18", expiry: "", urgency: "critical", icon: "leaf", amount: 30, added: "May 14",
    expiration: buildFixtureExpiration("2025-05-18", "override", { overriddenAt: "2025-05-14T09:00:00.000Z" }),
  },
];

/** One metadata example per display state, for tests and visual checks. */
export const expirationMetaFixtures = {
  unknown: buildFixtureExpiration(null, "estimated"),
  pastEstimated: buildFixtureExpiration("2025-05-17", "estimated", { reference: { name: "Sour cream", storage: "Fridge", shelfLifeDays: 14 } }),
  pastOverride: buildFixtureExpiration("2025-05-18", "override", { overriddenAt: "2025-05-14T09:00:00.000Z" }),
  today: buildFixtureExpiration("2025-05-19", "estimated"),
  tomorrow: buildFixtureExpiration("2025-05-20", "estimated"),
  soonOverride: buildFixtureExpiration("2025-05-21", "override", { overriddenAt: "2025-05-15T18:20:00.000Z" }),
  okEstimated: buildFixtureExpiration("2025-05-28", "estimated", { reference: { name: "Yogurt", storage: "Fridge", shelfLifeDays: 10 } }),
  farEstimated: buildFixtureExpiration("2026-01-19", "estimated"),
} satisfies Record<string, ExpirationMeta>;
