"use client";

import React, { useId, useState } from "react";
import { Modal, Button, Icon } from "@/components";
import type { PantryCreateRequest, PantryUpdateRequest } from "@/contracts/pantry";
import { PantryApiError } from "./pantry-api";
import {
  ALL_LOCATIONS,
  ALL_UNITS,
  computePantryChanges,
  defaultPantryFormValues,
  itemToPantryFormValues,
  validatePantryForm,
} from "./pantry-form-core";
import type { PantryFormErrors, PantryFormValues, PantryItem } from "./types";
import { formatUnit } from "./types";
import "./pantry-forms.css";

export interface PantryFormModalProps {
  isOpen: boolean;
  mode: "add" | "edit";
  item?: PantryItem | null;
  onClose: () => void;
  onSubmitAdd?: (request: PantryCreateRequest) => Promise<void>;
  onSubmitEdit?: (itemId: string, request: PantryUpdateRequest) => Promise<void>;
  onReloadLatest?: (item: PantryItem) => Promise<PantryItem | null> | PantryItem | null | void;
}

export function PantryFormModal({
  isOpen,
  mode,
  item,
  onClose,
  onSubmitAdd,
  onSubmitEdit,
  onReloadLatest,
}: PantryFormModalProps) {
  if (!isOpen) return null;
  if (mode === "edit" && !item) return null;

  // Keyed so each item / mode gets fresh state
  const key = mode === "edit" ? `edit-${item?.id}-${item?.version ?? 1}` : "add-item";
  return (
    <PantryFormModalBody
      key={key}
      mode={mode}
      item={item}
      onClose={onClose}
      onSubmitAdd={onSubmitAdd}
      onSubmitEdit={onSubmitEdit}
      onReloadLatest={onReloadLatest}
    />
  );
}

function PantryFormModalBody({
  mode,
  item,
  onClose,
  onSubmitAdd,
  onSubmitEdit,
  onReloadLatest,
}: Omit<PantryFormModalProps, "isOpen">) {
  const ids = useId();
  const titleId = `${ids}-title`;
  const nameErrorId = `${ids}-name-err`;
  const qtyErrorId = `${ids}-qty-err`;
  const unitErrorId = `${ids}-unit-err`;
  const locationErrorId = `${ids}-loc-err`;
  const addedOnErrorId = `${ids}-added-err`;
  const expirationErrorId = `${ids}-exp-err`;
  const notesErrorId = `${ids}-notes-err`;

  const initialValues: PantryFormValues =
    mode === "edit" && item ? itemToPantryFormValues(item) : defaultPantryFormValues();

  const [values, setValues] = useState<PantryFormValues>(initialValues);
  const [errors, setErrors] = useState<PantryFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isConflict, setIsConflict] = useState(false);

  const handleFieldChange = <K extends keyof PantryFormValues>(field: K, val: PantryFormValues[K]) => {
    setValues((prev) => ({ ...prev, [field]: val }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    if (submitError) {
      setSubmitError(null);
      setIsConflict(false);
    }
  };

  const handleReloadCurrent = async () => {
    if (item && onReloadLatest) {
      const fresh = await onReloadLatest(item);
      if (fresh) {
        setValues(itemToPantryFormValues(fresh));
      } else {
        onClose();
        return;
      }
    } else {
      setValues(initialValues);
    }
    setIsConflict(false);
    setSubmitError(null);
    setErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setSubmitError(null);
    setIsConflict(false);

    const validation = validatePantryForm(values);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === "add") {
        if (!onSubmitAdd) throw new Error("No add handler provided.");
        await onSubmitAdd(validation.cleaned!);
        onClose();
      } else {
        if (!onSubmitEdit || !item) throw new Error("No edit handler provided.");
        const { hasChanges, changes } = computePantryChanges(initialValues, values);
        if (!hasChanges) {
          setErrors({ general: "No changes to save." });
          setIsSubmitting(false);
          return;
        }
        await onSubmitEdit(String(item.id), {
          expectedVersion: item.version ?? 1,
          changes,
        });
        onClose();
      }
    } catch (err: unknown) {
      // Preserve inputs on failure
      if (err instanceof PantryApiError && err.code === "conflict") {
        setIsConflict(true);
        setSubmitError(err.message);
      } else if (err instanceof Error) {
        setSubmitError(err.message || "An error occurred while saving. Please try again.");
      } else {
        setSubmitError("Failed to save pantry item. Check your connection and try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={isSubmitting ? () => {} : onClose}
      className="pantry-form-modal"
      titleId={titleId}
    >
      <header className="pantry-form-header">
        <div>
          <span className="review-step">
            <Icon name="pantry" size={15} /> {mode === "add" ? "New item" : "Edit item"}
          </span>
          <h2 id={titleId}>{mode === "add" ? "Add to pantry" : `Edit ${item?.name}`}</h2>
          <p>
            {mode === "add"
              ? "Add a grocery or pantry item with estimated or custom expiration."
              : "Update item details, quantity, storage location, or expiration."}
          </p>
        </div>
        <Button
          variant="icon"
          onClick={onClose}
          disabled={isSubmitting}
          aria-label="Close"
        >
          <Icon name="close" />
        </Button>
      </header>

      <form onSubmit={handleSubmit} noValidate className="pantry-form">
        <div className="pantry-form-scroll">
          {submitError && (
            <div className={`pantry-alert-banner ${isConflict ? "conflict" : "error"}`} role="alert">
              <div>
                <strong>{isConflict ? "Item updated elsewhere" : "Save failed"}</strong>
                <span>{submitError}</span>
              </div>
              {isConflict && (
                <div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleReloadCurrent}
                    style={{ fontSize: "10px", padding: "5px 10px" }}
                  >
                    Review current values
                  </Button>
                </div>
              )}
            </div>
          )}

          {errors.general && (
            <div className="pantry-alert-banner error" role="alert">
              <span>{errors.general}</span>
            </div>
          )}

          <div className="pantry-form-grid">
            {/* Name */}
            <div className="form-group full-span">
              <label htmlFor={`${ids}-name`}>Food / Item name *</label>
              <input
                id={`${ids}-name`}
                name="name"
                value={values.name}
                onChange={(e) => handleFieldChange("name", e.target.value)}
                placeholder="e.g. Baby spinach, Greek yogurt"
                autoFocus={mode === "add"}
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? nameErrorId : undefined}
                required
              />
              {errors.name && (
                <p id={nameErrorId} className="field-error" role="alert">
                  {errors.name}
                </p>
              )}
            </div>

            {/* Quantity */}
            <div className="form-group">
              <label htmlFor={`${ids}-quantity`}>Quantity *</label>
              <input
                id={`${ids}-quantity`}
                name="quantity"
                inputMode="decimal"
                value={values.quantity}
                onChange={(e) => handleFieldChange("quantity", e.target.value)}
                placeholder="1"
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.quantity)}
                aria-describedby={errors.quantity ? qtyErrorId : undefined}
                required
              />
              {errors.quantity && (
                <p id={qtyErrorId} className="field-error" role="alert">
                  {errors.quantity}
                </p>
              )}
            </div>

            {/* Unit */}
            <div className="form-group">
              <label htmlFor={`${ids}-unit`}>Measurement unit *</label>
              <select
                id={`${ids}-unit`}
                name="unit"
                value={values.unit}
                onChange={(e) => handleFieldChange("unit", e.target.value as PantryFormValues["unit"])}
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.unit)}
                aria-describedby={errors.unit ? unitErrorId : undefined}
              >
                {ALL_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit} ({formatUnit(unit, "2")})
                  </option>
                ))}
              </select>
              {errors.unit && (
                <p id={unitErrorId} className="field-error" role="alert">
                  {errors.unit}
                </p>
              )}
            </div>

            {/* Storage Location */}
            <div className="form-group">
              <label htmlFor={`${ids}-location`}>Storage location *</label>
              <select
                id={`${ids}-location`}
                name="storageLocation"
                value={values.storageLocation}
                onChange={(e) =>
                  handleFieldChange("storageLocation", e.target.value as PantryFormValues["storageLocation"])
                }
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.storageLocation)}
                aria-describedby={errors.storageLocation ? locationErrorId : undefined}
              >
                {ALL_LOCATIONS.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
              {errors.storageLocation && (
                <p id={locationErrorId} className="field-error" role="alert">
                  {errors.storageLocation}
                </p>
              )}
            </div>

            {/* Added Date */}
            <div className="form-group">
              <label htmlFor={`${ids}-addedOn`}>Date added *</label>
              <input
                id={`${ids}-addedOn`}
                type="date"
                name="addedOn"
                value={values.addedOn}
                onChange={(e) => handleFieldChange("addedOn", e.target.value)}
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.addedOn)}
                aria-describedby={errors.addedOn ? addedOnErrorId : undefined}
                required
              />
              {errors.addedOn && (
                <p id={addedOnErrorId} className="field-error" role="alert">
                  {errors.addedOn}
                </p>
              )}
            </div>

            {/* Expiration Intent Selection */}
            <fieldset className="form-fieldset full-span">
              <legend>Expiration estimate & override</legend>
              <div className="expiration-choices">
                {/* 1. Estimate */}
                <label
                  className={`expiration-option ${values.expirationKind === "estimate" ? "selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="expirationKind"
                    value="estimate"
                    checked={values.expirationKind === "estimate"}
                    onChange={() => handleFieldChange("expirationKind", "estimate")}
                    disabled={isSubmitting}
                  />
                  <div className="expiration-option-content">
                    <strong>Estimated shelf-life</strong>
                    <small>
                      Calculated automatically from shared shelf-life guidelines for this food and storage location.
                    </small>
                  </div>
                </label>

                {/* 2. Manual override */}
                <label
                  className={`expiration-option ${values.expirationKind === "override" ? "selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="expirationKind"
                    value="override"
                    checked={values.expirationKind === "override"}
                    onChange={() => handleFieldChange("expirationKind", "override")}
                    disabled={isSubmitting}
                  />
                  <div className="expiration-option-content">
                    <strong>Manual date override</strong>
                    <small>Specify the exact package expiration or use-by date you want to enforce.</small>
                  </div>
                </label>

                {values.expirationKind === "override" && (
                  <div className="override-date-picker">
                    <label htmlFor={`${ids}-exp-date`} style={{ fontSize: "9px", display: "block", marginBottom: "4px" }}>
                      Exact expiration date *
                    </label>
                    <input
                      id={`${ids}-exp-date`}
                      type="date"
                      value={values.expirationDate}
                      onChange={(e) => handleFieldChange("expirationDate", e.target.value)}
                      disabled={isSubmitting}
                      aria-invalid={Boolean(errors.expirationDate)}
                      aria-describedby={errors.expirationDate ? expirationErrorId : undefined}
                      required
                    />
                    {errors.expirationDate && (
                      <p id={expirationErrorId} className="field-error" role="alert">
                        {errors.expirationDate}
                      </p>
                    )}
                  </div>
                )}

                {/* 3. Unknown */}
                <label
                  className={`expiration-option ${values.expirationKind === "unknown" ? "selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="expirationKind"
                    value="unknown"
                    checked={values.expirationKind === "unknown"}
                    onChange={() => handleFieldChange("expirationKind", "unknown")}
                    disabled={isSubmitting}
                  />
                  <div className="expiration-option-content">
                    <strong>Date unknown</strong>
                    <small>Keep expiration distinguishable without setting any unverified date.</small>
                  </div>
                </label>
              </div>
            </fieldset>

            {/* Notes */}
            <div className="form-group full-span">
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <label htmlFor={`${ids}-notes`}>Notes (optional)</label>
                <span className="char-counter">{values.notes.length}/2000</span>
              </div>
              <textarea
                id={`${ids}-notes`}
                name="notes"
                value={values.notes}
                onChange={(e) => handleFieldChange("notes", e.target.value)}
                placeholder="Storage reminders, package open date, brand, or meal ideas..."
                maxLength={2000}
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.notes)}
                aria-describedby={errors.notes ? notesErrorId : undefined}
              />
              {errors.notes && (
                <p id={notesErrorId} className="field-error" role="alert">
                  {errors.notes}
                </p>
              )}
            </div>
          </div>
        </div>

        <footer className="pantry-form-footer">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>{mode === "add" ? "Adding item..." : "Saving changes..."}</>
            ) : (
              <>
                <Icon name="check" size={16} />
                {mode === "add" ? "Add to pantry" : "Save changes"}
              </>
            )}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
