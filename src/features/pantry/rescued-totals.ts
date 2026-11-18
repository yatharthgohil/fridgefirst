import { rescuedTotalsSchema } from "@/contracts/inventory-totals";
export type { RescuedTotals } from "@/contracts/inventory-totals";

export async function loadRescuedTotals(now: Date, signal: AbortSignal) {
  const query = new URLSearchParams({
    start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
  });
  const response = await fetch(`/api/inventory/totals?${query}`, { signal, credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error("Could not load food rescued totals.");
  return rescuedTotalsSchema.parse(await response.json());
}
