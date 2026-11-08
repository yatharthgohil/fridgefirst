/**
 * State machine for the consume/discard dialog.
 *
 * Request-id rules (repeat-safety):
 * - A requestId is created when the user moves to the confirmation step and
 *   identifies that one intended deduction.
 * - Network/server failures keep the same requestId, so "Try again" can never
 *   apply the deduction twice even if the first attempt actually succeeded.
 * - Changing the amount or operation, a validation error, or a stale-data
 *   conflict starts a new intent and therefore clears the requestId.
 */
import type { AdjustmentOperation, InventoryErrorCode, ItemQuantity } from "@/contracts/inventory";
import { formatAmountWithUnit, isRetryableError } from "./inventory-core";

export interface AdjustmentState {
  step: "edit" | "review";
  operation: AdjustmentOperation;
  amountText: string;
  /** Latest quantity known to the client; sent as expectedQuantity. */
  available: number;
  unit: string;
  requestId: string | null;
  pending: boolean;
  /** Show field validation after the first review attempt. */
  showFieldError: boolean;
  error: { code: InventoryErrorCode; message: string; retryable: boolean } | null;
  /** Informational message, e.g. the item changed since the dialog opened. */
  notice: string | null;
}

export type AdjustmentAction =
  | { type: "operationChanged"; operation: AdjustmentOperation }
  | { type: "amountChanged"; text: string }
  | { type: "reviewRequested"; valid: boolean; requestId: string }
  | { type: "backToEdit" }
  | { type: "submitStarted" }
  | {
      type: "submitFailed";
      code: InventoryErrorCode;
      message: string;
      current?: ItemQuantity;
    };

export function createAdjustmentState(
  operation: AdjustmentOperation,
  available: number,
  unit: string,
): AdjustmentState {
  return {
    step: "edit",
    operation,
    amountText: "",
    available,
    unit,
    requestId: null,
    pending: false,
    showFieldError: false,
    error: null,
    notice: null,
  };
}

export function adjustmentReducer(state: AdjustmentState, action: AdjustmentAction): AdjustmentState {
  // While a request is in flight only its outcome may change the state.
  if (state.pending && action.type !== "submitFailed") return state;

  switch (action.type) {
    case "operationChanged":
      if (state.step !== "edit" || action.operation === state.operation) return state;
      return { ...state, operation: action.operation, requestId: null, error: null };

    case "amountChanged":
      if (state.step !== "edit") return state;
      return { ...state, amountText: action.text, requestId: null, error: null };

    case "reviewRequested":
      if (!action.valid) return { ...state, showFieldError: true };
      return {
        ...state,
        step: "review",
        showFieldError: true,
        error: null,
        // Reuse the id if the user went back without changing anything.
        requestId: state.requestId ?? action.requestId,
      };

    case "backToEdit":
      return { ...state, step: "edit", error: null };

    case "submitStarted":
      if (state.step !== "review" || !state.requestId) return state;
      return { ...state, pending: true, error: null, notice: null };

    case "submitFailed": {
      const base = { ...state, pending: false };

      if (action.code === "conflict") {
        const latest = action.current;
        const unitChanged = latest !== undefined && latest.unit !== state.unit;
        return {
          ...base,
          step: "edit",
          requestId: null,
          available: latest?.quantity ?? state.available,
          unit: latest?.unit ?? state.unit,
          amountText: unitChanged ? "" : state.amountText,
          error: null,
          notice: latest
            ? `This item changed since you opened it. It now has ${formatAmountWithUnit(latest.quantity, latest.unit)}. Review the amount before confirming.`
            : "This item changed since you opened it. Close this dialog to load the latest quantity.",
        };
      }

      if (action.code === "validation") {
        return {
          ...base,
          step: "edit",
          requestId: null,
          error: { code: action.code, message: action.message, retryable: false },
        };
      }

      return {
        ...base,
        error: {
          code: action.code,
          message: action.message,
          retryable: isRetryableError(action.code),
        },
      };
    }
  }
}
