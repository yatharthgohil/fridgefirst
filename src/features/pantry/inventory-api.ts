/**
 * Client-side inventory API. Components depend only on `InventoryApi`, so the
 * dashboard can pass the in-memory fixture today and the HTTP client once the
 * atomic consume/discard and history endpoints exist.
 */
import {
  INVENTORY_ENDPOINTS,
  inventoryAdjustmentResponseSchema,
  inventoryErrorResponseSchema,
  inventoryHistoryResponseSchema,
  type InventoryAdjustmentRequest,
  type InventoryAdjustmentResponse,
  type InventoryErrorCode,
  type InventoryHistoryEntry,
} from "@/contracts/inventory";
import { InventoryApiError } from "./inventory-core";

export interface InventoryApi {
  /** Atomically consume/discard. Must be idempotent per `requestId`. */
  adjust(
    request: InventoryAdjustmentRequest,
    options?: { signal?: AbortSignal },
  ): Promise<InventoryAdjustmentResponse>;
  /** Most recent history entries, newest first. */
  listHistory(options?: { limit?: number; signal?: AbortSignal }): Promise<InventoryHistoryEntry[]>;
}

const STATUS_CODES: Record<number, InventoryErrorCode> = {
  400: "validation",
  401: "unauthorized",
  403: "unauthorized",
  404: "not_found",
  409: "conflict",
  422: "validation",
};

const FALLBACK_MESSAGES: Record<InventoryErrorCode, string> = {
  validation: "That amount can't be saved. Check it and try again.",
  conflict: "This item changed since you opened it.",
  not_found: "This item is no longer in your pantry.",
  unauthorized: "Your session has expired. Sign in again to continue.",
  server: "FridgeFirst couldn't save this change. Try again.",
  network: "We couldn't reach FridgeFirst. Check your connection and try again.",
};

async function toApiError(response: Response): Promise<InventoryApiError> {
  const code = STATUS_CODES[response.status] ?? "server";
  const body = await response.json().catch(() => null);
  const parsed = inventoryErrorResponseSchema.safeParse(body);
  if (parsed.success) {
    const { code: bodyCode, message, current } = parsed.data.error;
    // Server messages are meant for users; raw 5xx details are not shown.
    return new InventoryApiError(bodyCode, bodyCode === "server" ? FALLBACK_MESSAGES.server : message, current);
  }
  return new InventoryApiError(code, FALLBACK_MESSAGES[code]);
}

async function send(input: string, init: RequestInit, fetchImpl: typeof fetch): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(input, { credentials: "same-origin", ...init });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new InventoryApiError("network", FALLBACK_MESSAGES.network);
  }
  if (!response.ok) throw await toApiError(response);
  return response.json().catch(() => {
    throw new InventoryApiError("server", FALLBACK_MESSAGES.server);
  });
}

function parseOrThrow<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new InventoryApiError("server", FALLBACK_MESSAGES.server);
  return parsed.data;
}

export function createHttpInventoryApi(fetchImpl: typeof fetch = (...args) => fetch(...args)): InventoryApi {
  return {
    async adjust(request, options) {
      const body = await send(
        INVENTORY_ENDPOINTS.adjustments,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": request.requestId },
          body: JSON.stringify(request),
          signal: options?.signal,
        },
        fetchImpl,
      );
      return parseOrThrow(inventoryAdjustmentResponseSchema, body);
    },

    async listHistory(options) {
      const params = new URLSearchParams();
      if (options?.limit) params.set("limit", String(options.limit));
      const query = params.size ? `?${params}` : "";
      const body = await send(
        `${INVENTORY_ENDPOINTS.history}${query}`,
        { method: "GET", signal: options?.signal },
        fetchImpl,
      );
      return parseOrThrow(inventoryHistoryResponseSchema, body).entries;
    },
  };
}
