import { scanConfirmRequestSchema, scanIdSchema } from "@/contracts/scans";
import { authenticatedApi } from "@/server/api/session";
import {
  ApiError,
  methodNotAllowed,
  privateResponse,
  readJson,
} from "@/server/api/protocol";
import { confirmScan } from "@/server/modules/scans/service";

type Context = { params: Promise<{ scanId: string }> };
export async function POST(request: Request, context: Context) {
  return authenticatedApi(async () => {
    const body = await readJson(request, scanConfirmRequestSchema);
    const id = scanIdSchema.safeParse((await context.params).scanId);
    if (!id.success)
      throw new ApiError({
        error: { code: "not_found", message: "Scan not found." },
      });
    return privateResponse(await confirmScan(id.data, body));
  });
}
export const GET = () => methodNotAllowed("POST");
export const HEAD = GET;
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
export const OPTIONS = GET;
