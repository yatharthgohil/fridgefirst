/**
 * Framework-free helpers for consume/discard and inventory history.
 * Kept free of React so they can be unit tested directly.
 */
import type {
  AdjustmentOperation,
  InventoryErrorCode,
  InventoryHistoryEntry,
  InventoryOperation,
  ItemQuantity,
} from "@/contracts/inventory";
import { formatUnit, type ActivityEvent, type PantryItem } from "./types";

/** Quantities are compared and stored to 3 decimal places. */
const PRECISION = 1000;
const EPSILON = 1 / PRECISION / 2;
const MAX_DECIMALS = 3;

export function roundQuantity(value: number): number {
  return Math.round(value * PRECISION) / PRECISION;
}

/** Parses a stored quantity string ("0.75") into a number; invalid -> 0. */
export function parseQuantity(quantity: string | number): number {
  const value = typeof quantity === "number" ? quantity : Number.parseFloat(quantity);
  return Number.isFinite(value) && value > 0 ? roundQuantity(value) : 0;
}

/** "0.500" -> "0.5", 2 -> "2". */
export function formatQuantity(value: number): string {
  return String(roundQuantity(value));
}

/** "2 bags", "0.5 bag", "250 g". */
export function formatAmountWithUnit(value: number, unit: string): string {
  const text = formatQuantity(value);
  return `${text} ${formatUnit(unit, text)}`;
}

export type AmountCheck =
  | { ok: true; amount: number; remaining: number }
  | {
      ok: false;
      reason: "empty" | "invalid" | "not_positive" | "too_precise" | "exceeds_available";
      message: string;
    };

/**
 * Validates a user-entered amount against what is available.
 * Accepts decimals ("0.5", ".5") and simple fractions ("1/2", "1 1/2").
 */
export function checkAdjustmentAmount(raw: string, available: number, unit: string): AmountCheck {
  const text = raw.trim();
  if (!text) return { ok: false, reason: "empty", message: "Enter an amount." };

  const amount = parseAmountText(text);
  if (amount === null) {
    return { ok: false, reason: "invalid", message: "Enter a number, like 1, 0.5 or 1/2." };
  }
  if (amount <= 0) {
    return { ok: false, reason: "not_positive", message: "Enter an amount greater than 0." };
  }
  if (/\./.test(text) && (text.split(".")[1]?.length ?? 0) > MAX_DECIMALS) {
    return { ok: false, reason: "too_precise", message: `Use at most ${MAX_DECIMALS} decimal places.` };
  }
  if (amount > available + EPSILON) {
    return {
      ok: false,
      reason: "exceeds_available",
      message:
        available > 0
          ? `Only ${formatAmountWithUnit(available, unit)} left. Enter ${formatQuantity(available)} or less.`
          : "Nothing is left to remove.",
    };
  }

  const rounded = roundQuantity(Math.min(amount, available));
  return { ok: true, amount: rounded, remaining: roundQuantity(available - rounded) };
}

function parseAmountText(text: string): number | null {
  const decimal = /^\d*\.?\d+$/;
  if (decimal.test(text)) return Number.parseFloat(text);

  const fraction = /^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/.exec(text);
  if (fraction) {
    const whole = fraction[1] ? Number(fraction[1]) : 0;
    const denominator = Number(fraction[3]);
    if (denominator === 0) return null;
    return whole + Number(fraction[2]) / denominator;
  }
  return null;
}

/** Shortcut chips for the amount field: a quarter, half, and everything. */
export function quickAmounts(available: number): { label: string; value: string }[] {
  if (available <= 0) return [];
  const options = [
    { label: "¼", value: roundQuantity(available / 4) },
    { label: "½", value: roundQuantity(available / 2) },
    { label: "All", value: roundQuantity(available) },
  ];
  const seen = new Set<number>();
  return options
    .filter((option) => option.value > 0 && !seen.has(option.value) && seen.add(option.value))
    .map((option) => ({ label: option.label, value: formatQuantity(option.value) }));
}

export type ActivityTone = "added" | "adjusted" | "removed" | "cooked";

const OPERATION_LABELS: Record<InventoryOperation, { label: string; tone: ActivityTone }> = {
  add: { label: "Added", tone: "added" },
  edit: { label: "Edited", tone: "adjusted" },
  delete: { label: "Deleted", tone: "removed" },
  consume: { label: "Used", tone: "cooked" },
  discard: { label: "Discarded", tone: "removed" },
  recipe_deduction: { label: "Used in recipe", tone: "cooked" },
};

/** Readable label for any operation, including ones added later by the backend. */
export function operationLabel(operation: string): string {
  const known = OPERATION_LABELS[operation as InventoryOperation];
  if (known) return known.label;
  const words = operation.replace(/[_-]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : "Updated";
}

export function operationTone(operation: string): ActivityTone {
  return OPERATION_LABELS[operation as InventoryOperation]?.tone ?? "adjusted";
}

export const ADJUSTMENT_COPY: Record<
  AdjustmentOperation,
  { action: string; title: string; amountLabel: string; confirm: string; done: string }
> = {
  consume: {
    action: "Used it",
    title: "Use",
    amountLabel: "Amount used",
    confirm: "Confirm use",
    done: "Used",
  },
  discard: {
    action: "Threw it out",
    title: "Discard",
    amountLabel: "Amount discarded",
    confirm: "Confirm discard",
    done: "Discarded",
  },
};

/** "+2 bags", "−0.5 bag" (true minus sign), or "No quantity change". */
export function formatDelta(delta: number | null, unit: string | null): string {
  if (delta === null || roundQuantity(delta) === 0) return "No quantity change";
  const magnitude = formatAmountWithUnit(Math.abs(delta), unit ?? "");
  return `${delta > 0 ? "+" : "−"}${magnitude}`.trim();
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Compact relative time for activity lists: "Just now", "5 min ago", "Yesterday", "Mon", "Mar 3". */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const time = date.getTime();
  if (Number.isNaN(time)) return "";
  const elapsed = now.getTime() - time;

  if (elapsed < MINUTE) return "Just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (time >= startOfToday) return `${Math.floor(elapsed / HOUR)} h ago`;
  if (time >= startOfToday - DAY) return "Yesterday";
  if (time >= startOfToday - 6 * DAY) {
    return date.toLocaleDateString("en-US", { weekday: "short" });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Full timestamp for tooltips and screen readers. */
export function formatAbsoluteTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export class InventoryApiError extends Error {
  readonly code: InventoryErrorCode;
  readonly current?: ItemQuantity;

  constructor(code: InventoryErrorCode, message: string, current?: ItemQuantity) {
    super(message);
    this.name = "InventoryApiError";
    this.code = code;
    this.current = current;
  }
}

export function toInventoryApiError(error: unknown): InventoryApiError {
  if (error instanceof InventoryApiError) return error;
  return new InventoryApiError("network", "We couldn't reach FridgeFirst. Check your connection and try again.");
}

/** Errors where resending the same request (same requestId) is appropriate. */
export function isRetryableError(code: InventoryErrorCode): boolean {
  return code === "network" || code === "server";
}

export function createRequestId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") return cryptoApi.randomUUID();
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Applies a server-confirmed quantity to a dashboard item. The fill meter
 * (`amount`, % left) scales proportionally with the quantity change.
 */
export function withUpdatedQuantity(item: PantryItem, quantity: number): PantryItem {
  const previous = parseQuantity(item.quantity);
  const ratio = previous > 0 ? quantity / previous : 0;
  return {
    ...item,
    quantity: formatQuantity(quantity),
    amount: Math.max(0, Math.min(100, Math.round(item.amount * ratio))),
  };
}

/** Converts a history entry to the dashboard's ActivityEvent shape (Activity page). */
export function historyEntryToActivityEvent(entry: InventoryHistoryEntry): ActivityEvent {
  const label = operationLabel(entry.operation);
  const tone = operationTone(entry.operation);
  return {
    id: Date.parse(entry.occurredAt) || Date.now(),
    day: "Today",
    time: "Just now",
    type: tone,
    title: `${entry.itemName} ${label.toLowerCase()}`,
    detail: `${label} ${formatDelta(entry.quantityDelta, entry.unit).replace(/^[+−]/, "")}`,
    meta: entry.operation === "discard" ? "Marked as discarded" : "Marked as used",
    quantity: formatDelta(entry.quantityDelta, entry.unit),
  };
}
