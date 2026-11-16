/**
 * Turns the pantry API's `expiration` + `urgency` into badge text. Pure and
 * framework-free. The backend (src/server/modules/expiration/policy.ts) owns
 * every urgency rule; this file only words what it returns:
 * - Every date is shown as an estimate or as the user's own date.
 * - Unknown dates stay "Date unknown"; nothing is implied about freshness.
 * - Past dates say the date has passed, never "expired", "spoiled" or "safe".
 */
import type { ExpirationResult, Urgency } from "@/contracts/pantry";
import type { ExpirationInfo, PantryItem } from "./types";

export type ExpirationTone = "unknown" | "past" | "critical" | "soon" | "later";

export interface ExpirationDisplay {
  tone: ExpirationTone;
  /** Short visible label, e.g. "Use tomorrow" or "Past date". */
  label: string;
  /** Visible source tag: "Estimate", "Your date", or null for unknown. */
  tag: string | null;
  /** Complete sentence for screen readers and tooltips. */
  description: string;
}

const UNKNOWN_INFO: ExpirationInfo = {
  expiration: { kind: "unknown", date: null, reason: "no_match" },
  urgency: { kind: "unknown", daysRemaining: null, label: "Date unknown" },
};

/** The item's API expiration info; items without any are treated as unknown. */
export function getExpirationInfo(item: Pick<PantryItem, "expirationInfo">): ExpirationInfo {
  return item.expirationInfo ?? UNKNOWN_INFO;
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

const TONES: Record<Urgency["kind"], ExpirationTone> = {
  unknown: "unknown",
  past_date: "past",
  critical: "critical",
  soon: "soon",
  later: "later",
};

export function describeExpiration({ expiration, urgency }: ExpirationInfo): ExpirationDisplay {
  if (expiration.kind === "unknown" || urgency.kind === "unknown") {
    return {
      tone: "unknown",
      label: "Date unknown",
      tag: null,
      description:
        expiration.kind === "unknown" && expiration.reason === "user_cleared"
          ? "Expiration date unknown. You cleared the estimate for this item."
          : "Expiration date unknown. No estimate is available for this item.",
    };
  }

  const tag = expiration.kind === "override" ? "Your date" : "Estimate";
  const noun = expiration.kind === "override" ? "Your date" : "Estimated date";
  const fullDate = formatCalendarDate(expiration.date);

  if (urgency.kind === "past_date") {
    const daysAgo = Math.abs(urgency.daysRemaining);
    const ago = daysAgo === 1 ? "yesterday" : `${plural(daysAgo, "day")} ago`;
    return {
      tone: "past",
      label: urgency.label,
      tag,
      description: `${noun} ${fullDate} passed ${ago}. Check the food before using it.`,
    };
  }

  return { tone: TONES[urgency.kind], label: urgency.label, tag, description: `${urgency.label}. ${noun}: ${fullDate}.` };
}

/** One explanation paragraph plus an optional source link for the details dialog. */
export function explainExpiration(expiration: ExpirationResult, urgency: Urgency): {
  lines: string[];
  source: { name: string; url: string } | null;
} {
  if (expiration.kind === "unknown") {
    return {
      lines:
        expiration.reason === "user_cleared"
          ? [
              "You cleared the estimated date for this item, so it isn't marked as fresh or as expiring.",
              "Add a date if you know one, or reset it to FridgeFirst's estimate.",
            ]
          : [
              "FridgeFirst has no shelf-life reference for this food in this storage location, so it isn't marked as fresh or as expiring.",
              "If you know when it should be used by, add a date and it will be sorted and flagged like your other items.",
            ],
      source: null,
    };
  }

  const lines: string[] = [];
  let source: { name: string; url: string } | null = null;
  if (expiration.kind === "override") {
    lines.push("You set this date. FridgeFirst won't change it automatically.");
  } else {
    const { foodName, storageLocation, days, sourceName, sourceUrl, assumptions } = expiration.provenance;
    lines.push(
      `Estimated as about ${plural(days, "day")} for ${foodName.toLowerCase()} stored in the ${storageLocation.toLowerCase()}, counted from the date it was added.`,
    );
    lines.push(`Assumes: ${assumptions}`);
    source = { name: sourceName, url: sourceUrl };
  }

  if (urgency.kind === "past_date") {
    lines.push("This date has passed. That alone doesn't tell you whether the food is still good or unsafe — check it before deciding.");
  } else if (expiration.kind === "estimate") {
    lines.push("Actual freshness depends on how the food was bought and stored. Check it before using, and change the date if you know better.");
  }
  return { lines, source };
}
