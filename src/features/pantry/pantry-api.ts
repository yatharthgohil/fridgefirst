/**
 * Client-side Pantry CRUD API.
 * Components depend only on `PantryApi`, so the dashboard can run with
 * in-memory fixtures (tests & offline demo) and with HTTP endpoints.
 */
import {
  pantryCreateRequestSchema,
  pantryDeleteRequestSchema,
  pantryItemResponseSchema,
  pantryListResponseSchema,
  pantryUpdateRequestSchema,
  type PantryCreateRequest,
  type PantryDeleteRequest,
  type PantryItem as ContractPantryItem,
  type PantryItemResponse,
  type PantryListResponse,
  type PantryUpdateRequest,
  type PersistedPantryItem,
  type ExpirationResult,
} from "@/contracts/pantry";
import { inventoryErrorResponseSchema, type InventoryErrorCode } from "@/contracts/inventory";
import { expirationUrgency } from "@/server/modules/expiration/policy";
import type { CalendarDate, StorageLocation, Unit } from "@/contracts/common";
import type { ExpirationInfo, PantryItem as UiPantryItem, StorageLocation as UiStorageLocation, UrgencyLevel } from "./types";

export type PantryErrorCode = "validation" | "conflict" | "not_found" | "unauthorized" | "server" | "network";

export class PantryApiError extends Error {
  readonly code: PantryErrorCode;
  readonly current?: PersistedPantryItem;

  constructor(code: PantryErrorCode, message: string, current?: PersistedPantryItem) {
    super(message);
    this.name = "PantryApiError";
    this.code = code;
    this.current = current;
  }
}

export interface PantryApi {
  list(options?: { signal?: AbortSignal }): Promise<PantryListResponse>;
  create(request: PantryCreateRequest, options?: { signal?: AbortSignal }): Promise<PantryItemResponse>;
  update(itemId: string, request: PantryUpdateRequest, options?: { signal?: AbortSignal }): Promise<PantryItemResponse>;
  delete(itemId: string, request: PantryDeleteRequest, options?: { signal?: AbortSignal }): Promise<void>;
}

export interface FixturePantryOptions {
  items?: (UiPantryItem | ContractPantryItem)[];
  asOfDate?: CalendarDate;
  latencyMs?: number;
}

export interface FixturePantryApi extends PantryApi {
  syncItems(items: (UiPantryItem | ContractPantryItem)[]): void;
}

const STATUS_CODES: Record<number, PantryErrorCode> = {
  400: "validation",
  401: "unauthorized",
  403: "unauthorized",
  404: "not_found",
  409: "conflict",
  422: "validation",
};

const FALLBACK_MESSAGES: Record<PantryErrorCode, string> = {
  validation: "The entered information is not valid. Please check and try again.",
  conflict: "This item was changed or removed in another session since you opened it.",
  not_found: "This item is no longer in your pantry.",
  unauthorized: "Your session has expired. Please sign in again.",
  server: "FridgeFirst couldn't save this change. Please try again.",
  network: "We couldn't connect to FridgeFirst. Check your connection and try again.",
};

async function toApiError(response: Response): Promise<PantryApiError> {
  const code = STATUS_CODES[response.status] ?? "server";
  const body = await response.json().catch(() => null);
  const parsed = inventoryErrorResponseSchema.safeParse(body);
  if (parsed.success) {
    const bodyCode = parsed.data.error.code as InventoryErrorCode;
    const message = parsed.data.error.message || FALLBACK_MESSAGES[code];
    return new PantryApiError(
      bodyCode === "conflict" ? "conflict" :
      bodyCode === "not_found" ? "not_found" :
      bodyCode === "unauthorized" ? "unauthorized" :
      bodyCode === "validation" ? "validation" :
      bodyCode === "server" ? "server" : code,
      message,
    );
  }
  return new PantryApiError(code, FALLBACK_MESSAGES[code]);
}

async function send(input: string, init: RequestInit, fetchImpl: typeof fetch): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(input, { credentials: "same-origin", ...init });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new PantryApiError("network", FALLBACK_MESSAGES.network);
  }
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return null;
  return response.json().catch(() => {
    throw new PantryApiError("server", FALLBACK_MESSAGES.server);
  });
}

export function createHttpPantryApi(fetchImpl: typeof fetch = (...args) => fetch(...args)): PantryApi {
  return {
    async list(options) {
      const body = await send("/api/pantry", { method: "GET", signal: options?.signal }, fetchImpl);
      return pantryListResponseSchema.parse(body);
    },

    async create(request, options) {
      const validated = pantryCreateRequestSchema.parse(request);
      const body = await send(
        "/api/pantry",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validated),
          signal: options?.signal,
        },
        fetchImpl,
      );
      return pantryItemResponseSchema.parse(body);
    },

    async update(itemId, request, options) {
      const validated = pantryUpdateRequestSchema.parse(request);
      const body = await send(
        `/api/pantry/${itemId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validated),
          signal: options?.signal,
        },
        fetchImpl,
      );
      return pantryItemResponseSchema.parse(body);
    },

    async delete(itemId, request, options) {
      const validated = pantryDeleteRequestSchema.parse(request);
      await send(
        `/api/pantry/${itemId}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validated),
          signal: options?.signal,
        },
        fetchImpl,
      );
    },
  };
}

export function inferPantryFoodArt(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("yogurt")) return "yogurt";
  if (lower.includes("broccoli")) return "broccoli";
  if (lower.includes("apple")) return "apple";
  if (lower.includes("chickpea") || lower.includes("bean")) return "chickpeas";
  return "leaf";
}

export function contractToUiItem(item: ContractPantryItem): UiPantryItem {
  const urgencyLevel: UrgencyLevel =
    item.urgency.kind === "critical" ? "critical" : item.urgency.kind === "soon" ? "soon" : "fresh";
  return {
    id: item.id,
    name: item.name,
    quantity: String(item.quantity),
    unit: item.unit,
    location: item.storageLocation as UiStorageLocation,
    expirationDate: item.expiration.date ?? "",
    expiry: item.urgency.label,
    urgency: urgencyLevel,
    icon: inferPantryFoodArt(item.name),
    amount: 100,
    added: item.addedOn,
    addedOn: item.addedOn,
    notes: item.notes,
    version: item.version,
    expirationInfo: {
      expiration: item.expiration,
      urgency: item.urgency,
    },
  };
}

export function uiToContractItem(
  item: UiPantryItem | ContractPantryItem,
  asOfDate: CalendarDate = "2026-11-16",
): ContractPantryItem {
  if ("storageLocation" in item && "expiration" in item && typeof item.quantity === "number") {
    return item as ContractPantryItem;
  }
  const ui = item as UiPantryItem;
  const expInfo: ExpirationInfo = ui.expirationInfo ?? (ui.expirationDate
    ? {
        expiration: {
          kind: "estimate" as const,
          date: ui.expirationDate,
          provenance: {
            referenceId: "00000000-0000-4000-8000-000000000999",
            foodName: ui.name,
            storageLocation: ui.location,
            days: 7,
            sourceName: "Shelf-life reference estimate",
            sourceUrl: "https://example.com/reference",
            sourceAccessedOn: (ui.addedOn || asOfDate) as CalendarDate,
            assumptions: "Refrigerated / typical pantry conditions",
          },
        },
        urgency: expirationUrgency(
          {
            kind: "estimate",
            date: ui.expirationDate,
            provenance: {
              referenceId: "00000000-0000-4000-8000-000000000999",
              foodName: ui.name,
              storageLocation: ui.location,
              days: 7,
              sourceName: "Shelf-life reference estimate",
              sourceUrl: "https://example.com/reference",
              sourceAccessedOn: (ui.addedOn || asOfDate) as CalendarDate,
              assumptions: "Refrigerated / typical pantry conditions",
            },
          },
          asOfDate,
        ),
      }
    : {
        expiration: { kind: "unknown" as const, date: null, reason: "no_match" as const },
        urgency: { kind: "unknown" as const, daysRemaining: null, label: "Date unknown" },
      });

  const parsedQty = parseFloat(ui.quantity);
  const qty = Number.isNaN(parsedQty) || parsedQty <= 0 ? 1 : parsedQty;

  const validUnits: Unit[] = ["item", "portion", "bag", "tub", "head", "can", "bunch", "cup", "tsp", "tbsp", "g", "kg", "mL", "L"];
  const unit = validUnits.includes(ui.unit as Unit) ? (ui.unit as Unit) : "item";

  const rawId = String(ui.id);
  const id = rawId.includes("-") ? rawId : `00000000-0000-4000-8000-${rawId.padStart(12, "0")}`;

  return {
    id,
    name: ui.name,
    quantity: qty,
    unit,
    storageLocation: ui.location,
    addedOn: (ui.addedOn || asOfDate) as CalendarDate,
    expiration: expInfo.expiration,
    notes: ui.notes ?? ui.note ?? null,
    status: "active",
    version: ui.version ?? 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    urgency: expInfo.urgency,
  };
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export function createFixturePantryApi(options: FixturePantryOptions = {}): FixturePantryApi {
  const asOfDate: CalendarDate = options.asOfDate || "2026-11-16";
  const latencyMs = options.latencyMs ?? 0;
  const store = new Map<string, ContractPantryItem>();

  let idCounter = 1000;
  function nextId(): string {
    idCounter += 1;
    return `00000000-0000-4000-8000-${String(idCounter).padStart(12, "0")}`;
  }

  function resolveUrgency(expiration: ExpirationResult) {
    return expirationUrgency(expiration, asOfDate);
  }

  if (options.items) {
    for (const item of options.items) {
      const contract = uiToContractItem(item, asOfDate);
      store.set(contract.id, contract);
      if (String(item.id) !== contract.id) {
        store.set(String(item.id), contract);
      }
    }
  }

  return {
    syncItems(items: (UiPantryItem | ContractPantryItem)[]) {
      for (const item of items) {
        const idKey = String(item.id);
        const existing = store.get(idKey);
        const contract = uiToContractItem(item, asOfDate);
        if (existing) {
          contract.version = existing.version;
        }
        store.set(contract.id, contract);
        if (idKey !== contract.id) {
          store.set(idKey, contract);
        }
      }
    },

    async list() {
      const seen = new Set<string>();
      const items: ContractPantryItem[] = [];
      for (const item of store.values()) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          items.push(item);
        }
      }
      return {
        items,
        asOfDate,
      };
    },

    async create(request, options) {
      await wait(latencyMs, options?.signal);
      const parsed = pantryCreateRequestSchema.parse(request);
      const id = nextId();
      const nowIso = new Date().toISOString();

      let expirationResult: ExpirationResult;
      if (parsed.expiration.kind === "override") {
        expirationResult = { kind: "override", date: parsed.expiration.date };
      } else if (parsed.expiration.kind === "unknown") {
        expirationResult = { kind: "unknown", date: null, reason: "user_cleared" };
      } else {
        const d = new Date(`${parsed.addedOn}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + 7);
        const estimatedDate = d.toISOString().slice(0, 10);
        expirationResult = {
          kind: "estimate",
          date: estimatedDate,
          provenance: {
            referenceId: "00000000-0000-4000-8000-000000000999",
            foodName: parsed.name,
            storageLocation: parsed.storageLocation,
            days: 7,
            sourceName: "Shelf-life reference estimate",
            sourceUrl: "https://example.com/reference",
            sourceAccessedOn: parsed.addedOn,
            assumptions: "Refrigerated / typical pantry conditions",
          },
        };
      }

      const urgency = resolveUrgency(expirationResult);

      const newItem: ContractPantryItem = {
        id,
        name: parsed.name,
        quantity: parsed.quantity,
        unit: parsed.unit,
        storageLocation: parsed.storageLocation,
        addedOn: parsed.addedOn,
        expiration: expirationResult,
        notes: parsed.notes ?? null,
        status: "active",
        version: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
        urgency,
      };

      store.set(id, newItem);
      return { item: newItem };
    },

    async update(itemId, request, options) {
      await wait(latencyMs, options?.signal);
      const parsed = pantryUpdateRequestSchema.parse(request);
      const existing = store.get(String(itemId));

      if (!existing) {
        throw new PantryApiError("not_found", "This item was not found in your pantry.");
      }

      if (existing.version !== parsed.expectedVersion) {
        const { urgency: _urg, ...persisted } = existing;
        throw new PantryApiError("conflict", "This item was changed or removed in another session since you opened it.", persisted);
      }

      const changes = parsed.changes;
      let newExpiration = existing.expiration;
      if (changes.expiration) {
        if (changes.expiration.kind === "override") {
          newExpiration = { kind: "override", date: changes.expiration.date };
        } else if (changes.expiration.kind === "unknown") {
          newExpiration = { kind: "unknown", date: null, reason: "user_cleared" };
        } else {
          const d = new Date(`${changes.addedOn ?? existing.addedOn}T00:00:00Z`);
          d.setUTCDate(d.getUTCDate() + 7);
          newExpiration = {
            kind: "estimate",
            date: d.toISOString().slice(0, 10),
            provenance: {
              referenceId: "00000000-0000-4000-8000-000000000999",
              foodName: changes.name ?? existing.name,
              storageLocation: changes.storageLocation ?? existing.storageLocation,
              days: 7,
              sourceName: "Shelf-life reference estimate",
              sourceUrl: "https://example.com/reference",
              sourceAccessedOn: changes.addedOn ?? existing.addedOn,
              assumptions: "Refrigerated / typical pantry conditions",
            },
          };
        }
      }

      const updated: ContractPantryItem = {
        ...existing,
        name: changes.name ?? existing.name,
        quantity: changes.quantity !== undefined ? changes.quantity : existing.quantity,
        unit: changes.unit ?? existing.unit,
        storageLocation: changes.storageLocation ?? existing.storageLocation,
        addedOn: changes.addedOn ?? existing.addedOn,
        expiration: newExpiration,
        notes: changes.notes !== undefined ? changes.notes : existing.notes,
        version: existing.version + 1,
        updatedAt: new Date().toISOString(),
        urgency: resolveUrgency(newExpiration),
      };

      store.set(existing.id, updated);
      if (String(itemId) !== existing.id) {
        store.set(String(itemId), updated);
      }
      return { item: updated };
    },

    async delete(itemId, request, options) {
      await wait(latencyMs, options?.signal);
      const parsed = pantryDeleteRequestSchema.parse(request);
      const existing = store.get(String(itemId));

      if (!existing) {
        throw new PantryApiError("not_found", "This item was not found in your pantry.");
      }

      if (existing.version !== parsed.expectedVersion) {
        const { urgency: _urg, ...persisted } = existing;
        throw new PantryApiError("conflict", "This item was changed or removed in another session since you opened it.", persisted);
      }

      store.delete(existing.id);
      store.delete(String(itemId));
    },
  };
}
