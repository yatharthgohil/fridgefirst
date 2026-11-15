import { pantryCreateRequestSchema } from "@/contracts/pantry";
import { authenticatedApi } from "@/server/api/session";
import { methodNotAllowed, privateResponse, readJson, validationError } from "@/server/api/protocol";
import { createPantryItem, listPantry } from "@/server/modules/pantry/service";

export async function GET(request: Request) {
  return authenticatedApi(async () => {
    if (new URL(request.url).search) throw validationError("Pantry query parameters are not supported.");
    return privateResponse(await listPantry());
  });
}

export async function POST(request: Request) {
  return authenticatedApi(async () => privateResponse(await createPantryItem(await readJson(request, pantryCreateRequestSchema)), 201));
}

export const PUT = () => methodNotAllowed("GET, HEAD, POST");
export const PATCH = PUT;
export const DELETE = PUT;
export const OPTIONS = PUT;
