import { z } from "zod";
import { scanIdSchema } from "@/contracts/scans";
import { authenticatedApi } from "@/server/api/session";
import {
  ApiError,
  methodNotAllowed,
  privateResponse,
  readJson,
} from "@/server/api/protocol";
import { analyzeScan } from "@/server/modules/scans/service";

type Context = { params: Promise<{ scanId: string }> };
export const maxDuration = 60;
export async function POST(request: Request, context: Context) {
  return authenticatedApi(async () => {
    await readJson(request, z.strictObject({}));
    const id = scanIdSchema.safeParse((await context.params).scanId);
    if (!id.success)
      throw new ApiError({
        error: { code: "not_found", message: "Scan not found." },
      });
    return privateResponse(await analyzeScan(id.data));
  });
}
export const GET = () => methodNotAllowed("POST");
export const HEAD = GET;
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
export const OPTIONS = GET;
