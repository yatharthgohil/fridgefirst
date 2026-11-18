import { rescuedMonthSchema } from "@/contracts/inventory-totals";
import { authenticatedApi } from "@/server/api/session";
import { methodNotAllowed, privateResponse, validationError } from "@/server/api/protocol";
import { inventoryTotals } from "@/server/modules/inventory/totals";

export async function GET(request: Request) {
  return authenticatedApi(async () => {
    const query = new URL(request.url).searchParams;
    if ([...query.keys()].some(key => key !== "start" && key !== "end") || query.getAll("start").length !== 1 || query.getAll("end").length !== 1) {
      throw validationError("Supply one start and end timestamp.");
    }
    const parsed = rescuedMonthSchema.safeParse({ start: query.get("start"), end: query.get("end") });
    if (!parsed.success) throw validationError("Supply a valid calendar month range.");
    return privateResponse(await inventoryTotals(parsed.data.start, parsed.data.end));
  });
}

export const POST = () => methodNotAllowed("GET, HEAD");
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
export const OPTIONS = POST;
