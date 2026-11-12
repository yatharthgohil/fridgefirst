import "server-only";
import { createClient } from "@/lib/supabase/server";
import { inventoryAdjustmentResponseSchema, inventoryHistoryResponseSchema, type InventoryAdjustmentRequest } from "@/contracts/inventory";
import { rpcResult } from "@/server/api/protocol";

export async function adjustInventory(request: InventoryAdjustmentRequest) {
  const client = await createClient();
  const { data, error } = await client.rpc("inventory_adjust", { p_request: request });
  if (error) throw new Error("Inventory adjustment failed");
  return rpcResult(data, inventoryAdjustmentResponseSchema);
}

export async function inventoryHistory(limit: number) {
  const client = await createClient();
  const { data, error } = await client.rpc("inventory_history", { p_limit: limit });
  if (error) throw new Error("Inventory history failed");
  return rpcResult(data, inventoryHistoryResponseSchema);
}
