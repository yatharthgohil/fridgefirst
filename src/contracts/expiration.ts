/**
 * Expiration metadata attached to each pantry item by the backend.
 *
 * STATUS: proposed contract. The expiration/urgency module owns every rule
 * here (shelf-life matching, the "expiring soon" threshold, how `daysUntil` is
 * computed for the user's timezone). The UI only renders these fields and
 * never recomputes urgency. Until the backend exists, the fixture in
 * `src/features/pantry/expiration-fixtures.ts` produces this shape.
 *
 * Safe for the browser: no secrets or server-only imports.
 */
import { z } from "zod";

/** Where the date came from. `unknown` means there is no date at all. */
export const expirationSourceSchema = z.enum(["estimated", "override", "unknown"]);
export type ExpirationSource = z.infer<typeof expirationSourceSchema>;

/**
 * Backend-assigned status. `past` means the date has passed; it does NOT mean
 * the food is unsafe, and `ok` does not mean it is safe.
 */
export const expirationStatusSchema = z.enum(["unknown", "past", "expiring_soon", "ok"]);
export type ExpirationStatus = z.infer<typeof expirationStatusSchema>;

export const shelfLifeReferenceSummarySchema = z.object({
  /** Reference entry name, e.g. "Leafy greens". */
  name: z.string(),
  /** Storage condition the estimate assumed, e.g. "Fridge". */
  storage: z.string(),
  shelfLifeDays: z.number().int().positive(),
});
export type ShelfLifeReferenceSummary = z.infer<typeof shelfLifeReferenceSummarySchema>;

export const expirationMetaSchema = z
  .object({
    /** Calendar date (YYYY-MM-DD) or null when unknown. */
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    source: expirationSourceSchema,
    status: expirationStatusSchema,
    /** Whole days from the user's today to `date`; negative when past; null when unknown. */
    daysUntil: z.number().int().nullable(),
    /** Present for `estimated` dates when a reference entry was used. */
    reference: shelfLifeReferenceSummarySchema.nullable().optional(),
    /** When the user set an override (ISO-8601), for `override` dates. */
    overriddenAt: z.string().nullable().optional(),
  })
  .refine((meta) => (meta.date === null) === (meta.source === "unknown"), {
    message: "date must be null exactly when source is unknown",
  })
  .refine((meta) => (meta.date === null) === (meta.status === "unknown"), {
    message: "status must be unknown exactly when date is null",
  });
export type ExpirationMeta = z.infer<typeof expirationMetaSchema>;

/**
 * Agreed "soonest expiration" ordering, applied identically by the API and UI:
 * 1. Items with a date, ascending by `date` (past dates come first).
 * 2. Items with an unknown date, after every dated item.
 * 3. Ties broken by item name (case-insensitive), then by item id.
 */
export const EXPIRATION_SORT_RULE = "date asc, unknown last, then name, then id" as const;
