/**
 * In-memory implementation of `InventoryApi` that follows the shared contract
 * in `src/contracts/inventory.ts`. Used until the real endpoints exist and in
 * unit tests. It mirrors the backend rules the UI depends on:
 * - a requestId is applied at most once (replays return the original result);
 * - a stale `expectedQuantity` returns `conflict` with the latest quantity;
 * - amounts above the stored quantity or in a different unit are rejected.
 */
import type {
  InventoryAdjustmentResponse,
  InventoryHistoryEntry,
  ItemQuantity,
} from "@/contracts/inventory";
import type { InventoryApi } from "./inventory-api";
import { InventoryApiError, parseQuantity, roundQuantity } from "./inventory-core";
import type { PantryItem } from "./types";

export interface FixtureItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
}

export interface FixtureInventoryApi extends InventoryApi {
  /**
   * Mirrors item changes made elsewhere (e.g. the dashboard's mock add/edit/
   * delete handlers) and records matching add/edit/delete history entries,
   * the way the real backend will.
   */
  syncItems(items: FixtureItem[]): void;
}

export interface FixtureOptions {
  items: FixtureItem[];
  history?: InventoryHistoryEntry[];
  latencyMs?: number;
  now?: () => Date;
}

export function toFixtureItem(item: PantryItem): FixtureItem {
  return { id: String(item.id), name: item.name, quantity: parseQuantity(item.quantity), unit: item.unit };
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

export function createFixtureInventoryApi({
  items,
  history,
  latencyMs = 350,
  now = () => new Date(),
}: FixtureOptions): FixtureInventoryApi {
  const store = new Map(items.map((item) => [item.id, { ...item }]));
  const entries: InventoryHistoryEntry[] = [...(history ?? createSeedHistory(now()))];
  const processed = new Map<string, { fingerprint: string; response: InventoryAdjustmentResponse }>();
  let sequence = 0;

  const record = (entry: Omit<InventoryHistoryEntry, "id" | "occurredAt">) => {
    const full: InventoryHistoryEntry = {
      ...entry,
      id: `fx-${Date.now().toString(36)}-${(sequence += 1)}`,
      occurredAt: now().toISOString(),
    };
    entries.unshift(full);
    return full;
  };

  const snapshot = (item: FixtureItem): ItemQuantity => ({
    id: item.id,
    quantity: item.quantity,
    unit: item.unit,
  });

  return {
    async adjust(request, options) {
      await wait(latencyMs, options?.signal);

      const fingerprint = JSON.stringify([
        request.itemId,
        request.operation,
        request.amount,
        request.unit,
        request.expectedQuantity,
      ]);
      const previous = processed.get(request.requestId);
      if (previous) {
        if (previous.fingerprint !== fingerprint) {
          throw new InventoryApiError("validation", "This request id was already used for a different change.");
        }
        return { ...previous.response, replayed: true };
      }

      const item = store.get(request.itemId);
      if (!item) throw new InventoryApiError("not_found", "This item is no longer in your pantry.");

      if (request.unit !== item.unit || roundQuantity(request.expectedQuantity) !== item.quantity) {
        throw new InventoryApiError("conflict", "This item changed since you opened it.", snapshot(item));
      }
      if (!(request.amount > 0) || roundQuantity(request.amount) > item.quantity) {
        throw new InventoryApiError("validation", `Enter an amount up to ${item.quantity} ${item.unit}.`);
      }

      item.quantity = roundQuantity(item.quantity - request.amount);
      const entry = record({
        itemId: item.id,
        itemName: item.name,
        operation: request.operation,
        quantityDelta: -roundQuantity(request.amount),
        unit: item.unit,
      });
      const response: InventoryAdjustmentResponse = { item: snapshot(item), entry, replayed: false };
      processed.set(request.requestId, { fingerprint, response });
      return response;
    },

    async listHistory(options) {
      await wait(latencyMs, options?.signal);
      const sorted = [...entries].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
      return options?.limit ? sorted.slice(0, options.limit) : sorted;
    },

    syncItems(nextItems) {
      const nextIds = new Set(nextItems.map((item) => item.id));
      for (const [id, item] of store) {
        if (!nextIds.has(id)) {
          store.delete(id);
          record({ itemId: null, itemName: item.name, operation: "delete", quantityDelta: -item.quantity, unit: item.unit });
        }
      }
      for (const next of nextItems) {
        const current = store.get(next.id);
        if (!current) {
          store.set(next.id, { ...next });
          record({ itemId: next.id, itemName: next.name, operation: "add", quantityDelta: next.quantity, unit: next.unit });
          continue;
        }
        if (current.name === next.name && current.unit === next.unit && current.quantity === next.quantity) continue;
        const sameUnit = current.unit === next.unit;
        const delta = sameUnit ? roundQuantity(next.quantity - current.quantity) : null;
        store.set(next.id, { ...next });
        record({
          itemId: next.id,
          itemName: next.name,
          operation: "edit",
          quantityDelta: delta === 0 ? null : delta,
          unit: sameUnit ? next.unit : null,
        });
      }
    },
  };
}

/** Seed history covering every operation label, timed relative to `now`. */
export function createSeedHistory(now: Date): InventoryHistoryEntry[] {
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
  return [
    { id: "seed-1", itemId: "1", itemName: "Baby spinach", operation: "add", quantityDelta: 1, unit: "bag", occurredAt: ago(95) },
    { id: "seed-2", itemId: "2", itemName: "Greek yogurt", operation: "edit", quantityDelta: -0.25, unit: "tub", occurredAt: ago(200) },
    { id: "seed-3", itemId: "3", itemName: "Broccoli", operation: "recipe_deduction", quantityDelta: -1, unit: "head", occurredAt: ago(60 * 22) },
    { id: "seed-4", itemId: null, itemName: "Milk", operation: "discard", quantityDelta: -0.3, unit: "L", occurredAt: ago(60 * 46) },
    { id: "seed-5", itemId: null, itemName: "Bananas", operation: "consume", quantityDelta: -3, unit: "item", occurredAt: ago(60 * 70) },
    { id: "seed-6", itemId: null, itemName: "Old salsa", operation: "delete", quantityDelta: -1, unit: "item", occurredAt: ago(60 * 96) },
  ];
}
