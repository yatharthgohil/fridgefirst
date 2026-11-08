"use client";

import React, { useId, useReducer, useRef, useState } from "react";
import { Button, Icon, Modal } from "@/components";
import type { AdjustmentOperation, InventoryAdjustmentResponse } from "@/contracts/inventory";
import { adjustmentReducer, createAdjustmentState } from "./adjustment-state";
import type { InventoryApi } from "./inventory-api";
import {
  ADJUSTMENT_COPY,
  checkAdjustmentAmount,
  createRequestId,
  formatAmountWithUnit,
  formatQuantity,
  parseQuantity,
  quickAmounts,
  toInventoryApiError,
} from "./inventory-core";
import { formatUnit, type PantryItem } from "./types";
import "./inventory.css";

export interface InventoryAdjustDialogProps {
  item: PantryItem | null;
  /** Initial operation; the user can switch inside the dialog before reviewing. */
  operation?: AdjustmentOperation;
  isOpen: boolean;
  api: InventoryApi;
  onClose: () => void;
  /**
   * Called once with the server-confirmed result. The host should update the
   * item's quantity from `result.item` and refresh the activity panel.
   */
  onAdjusted: (result: InventoryAdjustmentResponse) => void;
}

/**
 * Consume/discard dialog: enter an amount in the item's current unit, see the
 * remaining quantity, then confirm explicitly. Cancelling changes nothing.
 */
export function InventoryAdjustDialog({ item, isOpen, operation = "consume", ...rest }: InventoryAdjustDialogProps) {
  if (!isOpen || !item) return null;
  // Keyed so every opening starts with fresh state and a fresh request id.
  return <AdjustDialogBody key={`${item.id}:${operation}`} item={item} initialOperation={operation} {...rest} />;
}

interface BodyProps extends Omit<InventoryAdjustDialogProps, "item" | "isOpen" | "operation"> {
  item: PantryItem;
  initialOperation: AdjustmentOperation;
}

function AdjustDialogBody({ item, initialOperation, api, onClose, onAdjusted }: BodyProps) {
  const ids = useId();
  const titleId = `${ids}-title`;
  const amountId = `${ids}-amount`;
  const fieldErrorId = `${ids}-field-error`;
  const previewId = `${ids}-preview`;

  const [state, dispatch] = useReducer(
    adjustmentReducer,
    undefined,
    () => createAdjustmentState(initialOperation, parseQuantity(item.quantity), item.unit),
  );
  // Synchronous guard: blocks a second submit before React re-renders (double-click, Enter repeat).
  const inFlight = useRef(false);
  const amountInput = useRef<HTMLInputElement>(null);
  const [announcement, setAnnouncement] = useState("");

  const copy = ADJUSTMENT_COPY[state.operation];
  const unitLabel = formatUnit(state.unit, "2");
  const check = checkAdjustmentAmount(state.amountText, state.available, state.unit);
  const fieldError = state.showFieldError && !check.ok ? check.message : null;
  const close = () => {
    if (!state.pending) onClose();
  };

  const requestReview = (event: React.FormEvent) => {
    event.preventDefault();
    dispatch({ type: "reviewRequested", valid: check.ok, requestId: createRequestId() });
    if (!check.ok) amountInput.current?.focus();
  };

  const confirm = async () => {
    if (inFlight.current || !check.ok || !state.requestId || state.step !== "review") return;
    inFlight.current = true;
    dispatch({ type: "submitStarted" });
    try {
      const result = await api.adjust({
        requestId: state.requestId,
        itemId: String(item.id),
        operation: state.operation,
        amount: check.amount,
        unit: state.unit,
        expectedQuantity: state.available,
      });
      onAdjusted(result);
      onClose();
    } catch (error) {
      const apiError = toInventoryApiError(error);
      dispatch({ type: "submitFailed", code: apiError.code, message: apiError.message, current: apiError.current });
      if (apiError.code === "conflict") setAnnouncement("The quantity changed. Review the latest amount.");
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <Modal
      isOpen
      onClose={close}
      className="pantry-edit-modal adjust-modal"
      titleId={titleId}
    >
      <header className="pantry-edit-header">
        <div>
          <span className="review-step">
            <Icon name={state.operation === "discard" ? "minus" : "check"} size={15} />
            {state.step === "edit" ? "Update quantity" : "Confirm change"}
          </span>
          <h2 id={titleId}>
            {copy.title} {item.name}
          </h2>
          <p>
            Currently {formatAmountWithUnit(state.available, state.unit)} in {item.location.toLowerCase()}.
          </p>
        </div>
        <Button variant="icon" onClick={close} disabled={state.pending} aria-label="Close without changing">
          <Icon name="close" />
        </Button>
      </header>

      <p className="visually-hidden" aria-live="assertive">
        {announcement}
      </p>

      {state.step === "edit" ? (
        <form onSubmit={requestReview} noValidate>
          <div className="adjust-body">
            <fieldset className="adjust-operation">
              <legend>What happened?</legend>
              {(["consume", "discard"] as const).map((op) => (
                <label key={op} className={state.operation === op ? "selected" : ""}>
                  <input
                    type="radio"
                    name={`${ids}-operation`}
                    value={op}
                    checked={state.operation === op}
                    onChange={() => dispatch({ type: "operationChanged", operation: op })}
                  />
                  <Icon name={op === "discard" ? "minus" : "check"} size={15} />
                  {ADJUSTMENT_COPY[op].action}
                </label>
              ))}
            </fieldset>

            {state.notice && (
              <p className="adjust-notice" role="status">
                <Icon name="clock" size={15} /> {state.notice}
              </p>
            )}

            <div className="adjust-field">
              <label htmlFor={amountId}>
                {copy.amountLabel} <span>({unitLabel})</span>
              </label>
              <div className={`adjust-input ${fieldError ? "invalid" : ""}`}>
                <input
                  ref={amountInput}
                  id={amountId}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  value={state.amountText}
                  onChange={(event) => dispatch({ type: "amountChanged", text: event.target.value })}
                  aria-invalid={fieldError ? true : undefined}
                  aria-describedby={`${fieldError ? fieldErrorId : ""} ${previewId}`.trim()}
                  autoFocus
                />
                <span aria-hidden="true">{unitLabel}</span>
              </div>
              <div className="adjust-quick" role="group" aria-label="Quick amounts">
                {quickAmounts(state.available).map((option) => (
                  <Button
                    key={option.label}
                    type="button"
                    variant="secondary"
                    aria-label={`Set amount to ${option.value} ${unitLabel}`}
                    onClick={() => dispatch({ type: "amountChanged", text: option.value })}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
              {fieldError && (
                <p id={fieldErrorId} className="adjust-field-error" role="alert">
                  {fieldError}
                </p>
              )}
            </div>

            <RemainingPreview
              id={previewId}
              before={state.available}
              after={check.ok ? check.remaining : null}
              unit={state.unit}
            />

            {state.error && (
              <p className="adjust-error" role="alert">
                {state.error.message}
              </p>
            )}
          </div>

          <footer className="pantry-edit-footer">
            <Button type="button" variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={state.available <= 0}>
              Review change <Icon name="arrow" size={15} />
            </Button>
          </footer>
        </form>
      ) : (
        <>
          <div className="adjust-body" aria-busy={state.pending}>
            <dl className="adjust-summary">
              <div>
                <dt>Item</dt>
                <dd>{item.name}</dd>
              </div>
              <div>
                <dt>Action</dt>
                <dd>{copy.done}</dd>
              </div>
              <div>
                <dt>Amount</dt>
                <dd>{check.ok ? formatAmountWithUnit(check.amount, state.unit) : "—"}</dd>
              </div>
              <div className="adjust-summary-result">
                <dt>Remaining</dt>
                <dd>
                  {formatAmountWithUnit(state.available, state.unit)}
                  <Icon name="arrow" size={14} />
                  <strong>{check.ok ? formatAmountWithUnit(check.remaining, state.unit) : "—"}</strong>
                </dd>
              </div>
            </dl>
            {check.ok && check.remaining === 0 && (
              <p className="adjust-hint">This uses up all of the {item.name.toLowerCase()}.</p>
            )}

            {state.pending && (
              <p className="adjust-pending" role="status">
                <span className="adjust-spinner" aria-hidden="true" /> Saving…
              </p>
            )}
            {state.error && (
              <p className="adjust-error" role="alert">
                {state.error.message}
                {state.error.retryable && " Trying again is safe: the change will not be applied twice."}
              </p>
            )}
          </div>

          <footer className="pantry-edit-footer">
            <Button
              type="button"
              variant="secondary"
              onClick={() => dispatch({ type: "backToEdit" })}
              disabled={state.pending}
            >
              Back
            </Button>
            <Button
              type="button"
              className={state.operation === "discard" ? "adjust-confirm-discard" : ""}
              onClick={confirm}
              disabled={state.pending || (state.error !== null && !state.error.retryable)}
              autoFocus
            >
              {state.pending ? "Saving…" : state.error?.retryable ? "Try again" : copy.confirm}
            </Button>
          </footer>
        </>
      )}
    </Modal>
  );
}

function RemainingPreview({
  id,
  before,
  after,
  unit,
}: {
  id: string;
  before: number;
  after: number | null;
  unit: string;
}) {
  const percent = after === null || before <= 0 ? 100 : Math.round((after / before) * 100);
  return (
    <div id={id} className="adjust-preview" aria-live="polite">
      <div>
        <span>Remaining after this change</span>
        <strong>
          {after === null ? "—" : formatAmountWithUnit(after, unit)}
          <small> of {formatQuantity(before)}</small>
        </strong>
      </div>
      <span className="adjust-meter" aria-hidden="true">
        <i style={{ width: `${percent}%` }} />
      </span>
    </div>
  );
}

export interface InventoryAdjustControlsProps {
  item: PantryItem;
  api: InventoryApi;
  onAdjusted: (result: InventoryAdjustmentResponse) => void;
  /** Visible label; defaults to "Use". */
  label?: string;
}

/**
 * Drop-in trigger + dialog for a pantry row or card. Owns its open state so the
 * host only supplies the item, the API, and a refresh callback.
 */
export function InventoryAdjustControls({ item, api, onAdjusted, label = "Use" }: InventoryAdjustControlsProps) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);
  const empty = parseQuantity(item.quantity) <= 0;

  return (
    <>
      <Button
        variant="secondary"
        className="adjust-trigger"
        onClick={(event) => {
          trigger.current = event.currentTarget;
          setOpen(true);
        }}
        disabled={empty}
        aria-haspopup="dialog"
        aria-label={empty ? `${item.name} is used up` : `Use or discard ${item.name}`}
      >
        <Icon name="minus" size={14} /> {label}
      </Button>
      <InventoryAdjustDialog
        item={item}
        isOpen={open}
        api={api}
        onAdjusted={onAdjusted}
        onClose={() => {
          setOpen(false);
          // Return focus to the row so keyboard users keep their place.
          requestAnimationFrame(() => trigger.current?.focus());
        }}
      />
    </>
  );
}
