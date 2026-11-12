import { z } from "zod";
import { inventoryErrorResponseSchema, type InventoryErrorResponse } from "@/contracts/inventory";

const errorStatuses = { validation: 422, unauthorized: 401, not_found: 404, conflict: 409, server: 500 };

export class ApiError extends Error {
  readonly body: InventoryErrorResponse;
  readonly status: number;

  constructor(body: InventoryErrorResponse, status = errorStatuses[body.error.code]) {
    super(body.error.message);
    this.body = body;
    this.status = status;
  }
}

export function validationError(message: string, status = 422): ApiError {
  return new ApiError({ error: { code: "validation", message } }, status);
}

export function rpcResult<T>(data: unknown, schema: z.ZodType<T>): T {
  const failure = inventoryErrorResponseSchema.safeParse(data);
  if (failure.success) {
    // Only business failures are safe to relay. Infrastructure diagnostics stay private.
    if (failure.data.error.code === "server") throw new Error("RPC failed");
    throw new ApiError(failure.data);
  }
  return schema.parse(data);
}

export function privateResponse(body: unknown, status = 200): Response {
  const headers = { "Cache-Control": "private, no-store" };
  return status === 204 ? new Response(null, { status, headers }) : Response.json(body, { status, headers });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) return privateResponse(error.body, error.status);
  return privateResponse({ error: { code: "server", message: "Something went wrong. Try again later." } }, 500);
}

export function methodNotAllowed(allow: string): Response {
  const response = privateResponse({ error: { code: "validation", message: "Method not allowed." } }, 405);
  response.headers.set("Allow", allow);
  return response;
}

export function validateMutation(request: Request): void {
  const origin = request.headers.get("origin");
  const expectedOrigin = new URL(process.env.APP_ORIGIN || request.url).origin;
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin !== null && origin !== expectedOrigin)) {
    throw validationError("Cross-origin mutations are not allowed.", 400);
  }
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw validationError("Use application/json.", 400);
  }
}

export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  validateMutation(request);
  const reader = request.body?.getReader();
  if (!reader) throw validationError("Supply a JSON body.", 400);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 65536) {
        await reader.cancel();
        throw validationError("JSON body must not exceed 64 KiB.", 400);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw validationError("Supply valid JSON.", 400);
  }
  const result = schema.safeParse(json);
  if (!result.success) throw validationError("Request does not match the shared contract.");
  return result.data;
}

export function historyLimit(url: string): number {
  const query = new URL(url).searchParams;
  if ([...query.keys()].some((key) => key !== "limit") || query.getAll("limit").length > 1) {
    throw validationError("Only one limit query parameter is supported.");
  }
  const limit = query.get("limit");
  if (limit === null) return 20;
  if (!/^[0-9]+$/.test(limit) || Number(limit) < 1 || Number(limit) > 100) {
    throw validationError("Limit must be a decimal integer from 1 through 100.");
  }
  return Number(limit);
}

export const pantryItemIdSchema = z.uuid().brand<"PantryItemId">();
export type PantryItemId = z.infer<typeof pantryItemIdSchema>;

export function pantryItemId(value: string): PantryItemId {
  const result = pantryItemIdSchema.safeParse(value);
  if (!result.success) throw new ApiError({ error: { code: "not_found", message: "Item not found." } });
  return result.data;
}
