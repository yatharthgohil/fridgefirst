import { inventoryAdjustmentRequestSchema } from "@/contracts/inventory";
import { authenticatedApi } from "@/server/api/session";
import { methodNotAllowed, privateResponse, readJson, validationError } from "@/server/api/protocol";
import { adjustInventory } from "@/server/modules/inventory/service";

export async function POST(request: Request) {
  return authenticatedApi(async () => {
    const body = await readJson(request, inventoryAdjustmentRequestSchema);
    const key = request.headers.get("idempotency-key");
    if (key !== null && key !== body.requestId) throw validationError("Idempotency-Key must equal requestId.");
    return privateResponse(await adjustInventory(body));
  });
}

export const GET = () => methodNotAllowed("POST");
export const HEAD = GET;
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
export const OPTIONS = GET;
