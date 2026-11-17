import type { ExpirationResult, Urgency } from "@/contracts/pantry";
import type { Unit } from "@/contracts/common";

export type UrgencyLevel = "critical" | "soon" | "fresh";

export type StorageLocation = "Fridge" | "Freezer" | "Pantry" | "Counter";

export interface PantryItem {
  id: number | string;
  name: string;
  quantity: string;
  unit: string;
  location: StorageLocation;
  expirationDate: string;
  expiry: string;
  urgency: UrgencyLevel;
  icon: string;
  amount: number;
  added: string;
  note?: string;
  version?: number;
  addedOn?: string;
  notes?: string | null;
  status?: "active" | "consumed" | "discarded";
  /**
   * Expiration result and urgency exactly as returned by the pantry API
   * (`src/contracts/pantry.ts`). Expiration badges and filters read only this.
   */
  expirationInfo?: ExpirationInfo;
}

export type ExpirationFormKind = "estimate" | "override" | "unknown";

export interface PantryFormValues {
  name: string;
  quantity: string;
  unit: Unit;
  storageLocation: StorageLocation;
  addedOn: string;
  expirationKind: ExpirationFormKind;
  expirationDate: string;
  notes: string;
}

export type PantryFormField = keyof PantryFormValues | "general";

export type PantryFormErrors = Partial<Record<PantryFormField, string>>;

export interface ExpirationInfo {
  expiration: ExpirationResult;
  urgency: Urgency;
}

export interface UnitOption {
  value: string;
  label: string;
}

export interface ActivityEvent {
  id: number | string;
  timestamp?: number;
  day: string;
  time: string;
  type: "added" | "cooked" | "adjusted" | "removed";
  title: string;
  detail: string;
  meta: string;
  quantity: string;
}

export function formatUnit(unit: string, quantity: string): string {
  if (Number.parseFloat(quantity) === 1 || ["tsp", "tbsp", "g", "kg", "mL", "L"].includes(unit)) {
    return unit;
  }
  if (unit === "bunch") return "bunches";
  return `${unit}s`;
}

export function calculateExpirationMeta(
  expirationDate: string,
  reference: Date = new Date()
): {
  expiry: string;
  urgency: UrgencyLevel;
} {
  if (!expirationDate) return { expiry: "Date unknown", urgency: "fresh" };
  const targetDate = new Date(`${expirationDate}T00:00:00`);
  const targetTime = targetDate.getTime();
  const refDate = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  const refTime = refDate.getTime();
  const days = Number.isNaN(targetTime)
    ? 0
    : Math.round((targetTime - refTime) / 86400000);

  if (days < 0) return { expiry: "Past date", urgency: "critical" };
  if (days === 0) return { expiry: "Use today", urgency: "critical" };
  if (days === 1) return { expiry: "Use tomorrow", urgency: "critical" };
  if (days <= 4) return { expiry: `${days} days left`, urgency: "soon" };
  if (days < 45) return { expiry: `${days} days left`, urgency: "fresh" };
  const months = Math.max(2, Math.round(days / 30));
  return { expiry: `${months} months`, urgency: "fresh" };
}

export function isPastDateItem(item: PantryItem): boolean {
  if (item.expirationInfo?.urgency.kind === "past_date") return true;
  const expiryLower = (item.expiry || "").toLowerCase();
  if (expiryLower.includes("past")) return true;
  if (item.expirationDate) {
    const exp = new Date(`${item.expirationDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!Number.isNaN(exp.getTime()) && exp.getTime() < today.getTime()) {
      return true;
    }
  }
  return false;
}

export function isAttentionItem(item: PantryItem): boolean {
  if (Number(item.quantity) <= 0) return false;
  if (isPastDateItem(item)) return true;
  if (item.urgency === "critical" || item.urgency === "soon") return true;
  if (item.expirationInfo) {
    const kind = item.expirationInfo.urgency.kind;
    if (kind === "past_date" || kind === "critical" || kind === "soon") return true;
  }
  const expiryLower = (item.expiry || "").toLowerCase();
  if (expiryLower.includes("today") || expiryLower.includes("tomorrow")) return true;
  return false;
}
