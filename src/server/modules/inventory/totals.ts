import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ApiError } from "@/server/api/protocol";
import { rescuedTransactionSchema, sumRescuedTransactions } from "./totals-core";

export async function inventoryTotals(start: string, end: string) {
  const client = await createClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) throw new ApiError({ error: { code: "unauthorized", message: "Sign in to continue." } });
  const cutoff = new Date().toISOString();
  return sumRescuedTransactions(async (afterId) => {
    let query = client.from("inventory_transactions")
      .select("transaction_id,occurred_at,quantity_delta,unit")
      .eq("user_id", auth.user.id)
      .in("operation", ["consume", "recipe_deduction"])
      .lte("occurred_at", cutoff)
      .order("transaction_id", { ascending: true })
      .limit(500);
    if (afterId) query = query.gt("transaction_id", afterId);
    const { data, error } = await query;
    if (error) throw new Error("Inventory totals failed.");
    return rescuedTransactionSchema.array().parse(data);
  }, Date.parse(start), Date.parse(end));
}
