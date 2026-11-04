export type UrgencyLevel = "critical" | "soon" | "fresh";

export type StorageLocation = "Fridge" | "Freezer" | "Pantry" | "Counter";

export interface PantryItem {
  id: number;
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
}

export interface UnitOption {
  value: string;
  label: string;
}

export interface ActivityEvent {
  id: number;
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

export function calculateExpirationMeta(expirationDate: string, reference: Date = new Date("2025-05-19T00:00:00")): {
  expiry: string;
  urgency: UrgencyLevel;
} {
  const targetDate = new Date(`${expirationDate}T00:00:00`);
  const targetTime = targetDate.getTime();
  const days = Number.isNaN(targetTime)
    ? 0
    : Math.max(0, Math.round((targetTime - reference.getTime()) / 86400000));

  if (days === 0) return { expiry: "Use today", urgency: "critical" };
  if (days === 1) return { expiry: "Use tomorrow", urgency: "critical" };
  if (days <= 4) return { expiry: `${days} days left`, urgency: "soon" };
  if (days < 45) return { expiry: `${days} days left`, urgency: "fresh" };
  const months = Math.max(2, Math.round(days / 30));
  return { expiry: `${months} months`, urgency: "fresh" };
}
