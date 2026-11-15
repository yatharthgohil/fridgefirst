import { pantryUpdateRequestSchema, pantryDeleteRequestSchema } from "@/contracts/pantry";
import { authenticatedApi } from "@/server/api/session";
import { methodNotAllowed, pantryItemId, privateResponse, readJson } from "@/server/api/protocol";
import { deletePantryItem, updatePantryItem } from "@/server/modules/pantry/service";

type Context = { params: Promise<{ itemId: string }> };

export async function PATCH(request: Request, context: Context) {
  return authenticatedApi(async () => {
    const body = await readJson(request, pantryUpdateRequestSchema);
    const id = pantryItemId((await context.params).itemId);
    return privateResponse(await updatePantryItem(id, body));
  });
}

export async function DELETE(request: Request, context: Context) {
  return authenticatedApi(async () => {
    const body = await readJson(request, pantryDeleteRequestSchema);
    const id = pantryItemId((await context.params).itemId);
    await deletePantryItem(id, body);
    return privateResponse(null, 204);
  });
}

export const GET = () => methodNotAllowed("PATCH, DELETE");
export const HEAD = GET;
export const POST = GET;
export const PUT = GET;
export const OPTIONS = GET;
