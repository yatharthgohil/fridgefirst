import { authenticatedApi } from "@/server/api/session";
import { historyLimit, methodNotAllowed, privateResponse } from "@/server/api/protocol";
import { inventoryHistory } from "@/server/modules/inventory/service";

export async function GET(request: Request) {
  return authenticatedApi(async () => privateResponse(await inventoryHistory(historyLimit(request.url))));
}

export const POST = () => methodNotAllowed("GET, HEAD");
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
export const OPTIONS = POST;
