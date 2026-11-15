import type { CalendarDate } from "@/contracts/common";
import type { ExpirationResult, PantryItem, PersistedPantryItem, Urgency } from "@/contracts/pantry";

const MILLISECONDS_PER_DAY = 86_400_000;

function epochDay(date: CalendarDate): number {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(0);
  utc.setUTCFullYear(year, month - 1, day);
  return Math.floor(utc.getTime() / MILLISECONDS_PER_DAY);
}

export function utcToday(now: Date = new Date()): CalendarDate {
  const year = String(now.getUTCFullYear()).padStart(4, "0");
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function expirationUrgency(expiration: ExpirationResult, today: CalendarDate): Urgency {
  if (expiration.kind === "unknown") {
    return { kind: "unknown", daysRemaining: null, label: "Date unknown" };
  }
  const daysRemaining = epochDay(expiration.date) - epochDay(today);
  if (daysRemaining < 0) {
    return { kind: "past_date", daysRemaining, label: "Past date" };
  }
  if (daysRemaining === 0) {
    return { kind: "critical", daysRemaining, label: "Use today" };
  }
  if (daysRemaining === 1) {
    return { kind: "critical", daysRemaining, label: "Use tomorrow" };
  }
  if (daysRemaining <= 4) {
    return { kind: "soon", daysRemaining, label: `${daysRemaining} days left` };
  }
  return { kind: "later", daysRemaining, label: `${daysRemaining} days left` };
}

export function withUrgency(item: PersistedPantryItem, today: CalendarDate): PantryItem {
  return { ...item, urgency: expirationUrgency(item.expiration, today) };
}

export function compareBySoonestExpiration(a: PantryItem, b: PantryItem): number {
  const left = a.expiration.kind === "unknown" ? null : a.expiration.date;
  const right = b.expiration.kind === "unknown" ? null : b.expiration.date;
  if (left === null || right === null) {
    if (left === right) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    return left === null ? 1 : -1;
  }
  if (left !== right) return left < right ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
