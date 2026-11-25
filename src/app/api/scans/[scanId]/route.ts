import { z } from "zod";
import { scanIdSchema } from "@/contracts/scans";
import { authenticatedApi } from "@/server/api/session";
import {
  ApiError,
  methodNotAllowed,
  privateResponse,
  readJson,
  validationError,
} from "@/server/api/protocol";
import { deleteScan, getScan } from "@/server/modules/scans/service";

type Context = { params: Promise<{ scanId: string }> };
function id(value: string) {
  const result = scanIdSchema.safeParse(value);
  if (!result.success)
    throw new ApiError({
      error: { code: "not_found", message: "Scan not found." },
    });
  return result.data;
}
export async function GET(request: Request, context: Context) {
  return authenticatedApi(async () => {
    if (new URL(request.url).search)
      throw validationError("Scan query parameters are not supported.");
    return privateResponse(await getScan(id((await context.params).scanId)));
  });
}
export async function DELETE(request: Request, context: Context) {
  return authenticatedApi(async () => {
    await readJson(request, z.strictObject({}));
    await deleteScan(id((await context.params).scanId));
    return privateResponse(null, 204);
  });
}
export const POST = () => methodNotAllowed("GET, HEAD, DELETE");
export const PUT = POST;
export const PATCH = POST;
export const OPTIONS = POST;
