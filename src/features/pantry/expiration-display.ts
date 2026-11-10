/**
 * Turns backend expiration metadata into user-facing text. Pure and
 * framework-free. Wording rules:
 * - Every date is presented as an estimate or as the user's own date.
 * - Unknown dates stay "Date unknown"; nothing is implied about freshness.
 * - Past dates say the date has passed, never "expired", "spoiled" or "safe".
 * - No thresholds live here: status and daysUntil come from the backend.
 */
import type { ExpirationMeta, ExpirationStatus } from "@/contracts/expiration";
import type { PantryItem } from "./types";

export type ExpirationTone = "unknown" | "past" | "soon" | "ok";

export interface ExpirationDisplay {
  tone: ExpirationTone;
  /** Short visible label, e.g. "Use within 2 days". */
  label: string;
  /** Visible source tag: "Estimate", "Your date", or null for unknown. */
  tag: string | null;
  /** Complete sentence for screen readers and tooltips. */
  description: string;
}

const UNKNOWN_META: ExpirationMeta = { date: null, source: "unknown", status: "unknown", daysUntil: null };

/**
 * Item expiration metadata. Items without backend metadata are treated as
 * unknown only when they have no date at all; otherwise the date is shown
 * without a status rather than guessing one on the client.
 */
export function getExpiration(item: Pick<PantryItem, "expiration" | "expirationDate">): ExpirationMeta {
  if (item.expiration) return item.expiration;
  if (!item.expirationDate) return UNKNOWN_META;
  return { date: item.expirationDate, source: "estimated", status: "ok", daysUntil: null };
}

export function getExpirationStatus(item: Pick<PantryItem, "expiration" | "expirationDate">): ExpirationStatus {
  return getExpiration(item).status;
}

/** "2025-05-21" -> "May 21, 2025" (calendar date, no timezone shift). */
export function formatCalendarDate(date: string, options: { year?: boolean } = {}): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: options.year === false ? undefined : "numeric",
    timeZone: "UTC",
  });
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function sourceTag(meta: ExpirationMeta): string | null {
  if (meta.source === "override") return "Your date";
  if (meta.source === "estimated") return "Estimate";
  return null;
}

function sourceNoun(meta: ExpirationMeta): string {
  return meta.source === "override" ? "Your date" : "Estimated date";
}

export function describeExpiration(meta: ExpirationMeta): ExpirationDisplay {
  if (meta.status === "unknown" || meta.date === null) {
    return {
      tone: "unknown",
      label: "Date unknown",
      tag: null,
      description: "Expiration date unknown. No estimate is available for this item.",
    };
  }

  const fullDate = formatCalendarDate(meta.date);
  const shortDate = formatCalendarDate(meta.date, { year: false });
  const tag = sourceTag(meta);
  const noun = sourceNoun(meta);
  const days = meta.daysUntil;

  if (meta.status === "past") {
    const ago = days === null ? `on ${shortDate}` : days === -1 ? "yesterday" : `${plural(Math.abs(days), "day")} ago`;
    return {
      tone: "past",
      label: meta.source === "override" ? "Past your date" : "Past estimated date",
      tag,
      description: `${noun} ${fullDate} passed ${ago}. Check the food before using it.`,
    };
  }

  if (meta.status === "expiring_soon") {
    const label =
      days === null ? `Use by ${shortDate}` : days <= 0 ? "Use today" : days === 1 ? "Use by tomorrow" : `Use within ${plural(days, "day")}`;
    return { tone: "soon", label, tag, description: `${label}. ${noun}: ${fullDate}.` };
  }

  const label = days === null || days > 45 ? `By ${shortDate}` : `${plural(days, "day")} left`;
  return { tone: "ok", label, tag, description: `${label}. ${noun}: ${fullDate}.` };
}

/** Longer explanation shown in the details dialog. */
export function explainExpiration(meta: ExpirationMeta): string[] {
  const lines: string[] = [];
  if (meta.source === "unknown" || meta.date === null) {
    lines.push("FridgeFirst couldn't estimate a date for this item, so it isn't marked as fresh or as expiring.");
    lines.push("If you know when it should be used by, add a date and it will be sorted and flagged like your other items.");
    return lines;
  }

  if (meta.source === "override") {
    lines.push(
      meta.overriddenAt
        ? `You set this date on ${formatCalendarDate(meta.overriddenAt.slice(0, 10))}. FridgeFirst won't change it automatically.`
        : "You set this date. FridgeFirst won't change it automatically.",
    );
  } else if (meta.reference) {
    const { name, storage, shelfLifeDays } = meta.reference;
    lines.push(
      `Estimated from typical shelf life for ${name.toLowerCase()} stored in the ${storage.toLowerCase()} (about ${plural(shelfLifeDays, "day")}).`,
    );
  } else {
    lines.push("This date is an estimate based on typical shelf life.");
  }

  if (meta.status === "past") {
    lines.push("This date has passed. That alone doesn't tell you whether the food is still good or unsafe — check it before deciding.");
  } else if (meta.source === "estimated") {
    lines.push("Actual freshness depends on how the food was bought and stored. Check it before using, and change the date if you know better.");
  }
  return lines;
}
