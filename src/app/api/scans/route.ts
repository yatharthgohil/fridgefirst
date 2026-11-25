import { scanCreateRequestSchema } from "@/contracts/scans";
import { authenticatedApi } from "@/server/api/session";
import {
  methodNotAllowed,
  privateResponse,
  readJson,
} from "@/server/api/protocol";
import { createScan } from "@/server/modules/scans/service";

export async function POST(request: Request) {
  return authenticatedApi(async () =>
    privateResponse(
      await createScan(await readJson(request, scanCreateRequestSchema)),
      201,
    ),
  );
}
export const GET = () => methodNotAllowed("POST");
export const HEAD = GET;
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
export const OPTIONS = GET;
