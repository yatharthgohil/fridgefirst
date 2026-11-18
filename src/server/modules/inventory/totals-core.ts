import { z } from "zod";
import { calculateEventRescuedKg } from "@/features/pantry/inventory-core";
import type { RescuedTotals } from "@/contracts/inventory-totals";

export const rescuedTransactionSchema = z.object({
  transaction_id: z.uuid(),
  occurred_at: z.iso.datetime({ offset: true }),
  quantity_delta: z.number().finite().nullable(),
  unit: z.string().nullable(),
});
export type RescuedTransaction = z.infer<typeof rescuedTransactionSchema>;

export async function sumRescuedTransactions(
  fetchPage: (afterId: string | null) => Promise<RescuedTransaction[]>,
  start: number,
  end: number,
): Promise<RescuedTotals> {
  let afterId: string | null = null;
  let monthlyKg = 0;
  let lifetimeKg = 0;
  while (true) {
    const rows = await fetchPage(afterId);
    if (rows.length === 0) return { monthlyKg, lifetimeKg };
    for (const row of rows) {
      const kg = row.quantity_delta === null ? 0 : calculateEventRescuedKg({
        id: row.transaction_id, type: "cooked", quantityDelta: row.quantity_delta, unit: row.unit,
        day: "", time: "", title: "", detail: "", meta: "", quantity: "",
      });
      lifetimeKg += kg;
      const occurredAt = Date.parse(row.occurred_at);
      if (occurredAt >= start && occurredAt < end) monthlyKg += kg;
    }
    const lastId = rows[rows.length - 1].transaction_id;
    if (lastId === afterId) throw new Error("Inventory totals pagination did not advance.");
    afterId = lastId;
  }
}
