import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { persistedPantryItemSchema, type PantryCreateRequest, type PantryUpdateRequest, type PantryDeleteRequest } from "@/contracts/pantry";
import { rpcResult, type PantryItemId } from "@/server/api/protocol";
import { utcToday, withUrgency } from "@/server/modules/expiration";

const itemResultSchema = z.strictObject({ item: persistedPantryItemSchema });

export async function listPantry() {
  const client = await createClient();
  const { data, error } = await client.rpc("pantry_list");
  if (error) throw new Error("Pantry list failed");
  const result = rpcResult(data, z.strictObject({ items: z.array(persistedPantryItemSchema) }));
  const asOfDate = utcToday();
  return { items: result.items.map((item) => withUrgency(item, asOfDate)), asOfDate };
}

export async function createPantryItem(request: PantryCreateRequest) {
  const client = await createClient();
  const { data, error } = await client.rpc("pantry_create", { p_request: request });
  if (error) throw new Error("Pantry create failed");
  return { item: withUrgency(rpcResult(data, itemResultSchema).item, utcToday()) };
}

export async function updatePantryItem(itemId: PantryItemId, request: PantryUpdateRequest) {
  const client = await createClient();
  const { data, error } = await client.rpc("pantry_update", { p_item_id: itemId, p_request: request });
  if (error) throw new Error("Pantry update failed");
  return { item: withUrgency(rpcResult(data, itemResultSchema).item, utcToday()) };
}

export async function deletePantryItem(itemId: PantryItemId, request: PantryDeleteRequest) {
  const client = await createClient();
  const { data, error } = await client.rpc("pantry_delete", { p_item_id: itemId, p_request: request });
  if (error) throw new Error("Pantry delete failed");
  rpcResult(data, z.strictObject({ deleted: z.literal(true) }));
}
