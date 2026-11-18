/**
 * Framework-free validation and mapping for pantry add/edit forms.
 * Follows src/contracts/pantry.ts and src/contracts/common.ts.
 */
import { calendarDateSchema, unitSchema, storageLocationSchema } from "@/contracts/common";
import {
  pantryChangesSchema,
  pantryCreateRequestSchema,
  type ExpirationIntent,
  type PantryChanges,
  type PantryCreateRequest,
  type PantryItem as ContractPantryItem,
  type PersistedPantryItem,
} from "@/contracts/pantry";
import type { ExpirationFormKind, PantryFormErrors, PantryFormValues, PantryItem } from "./types";

export const ALL_UNITS = unitSchema.options;
export const ALL_LOCATIONS = storageLocationSchema.options;

export function defaultPantryFormValues(today?: string): PantryFormValues {
  const now = today || new Date().toISOString().slice(0, 10);
  return {
    name: "",
    quantity: "1",
    unit: "item",
    storageLocation: "Fridge",
    addedOn: now,
    expirationKind: "estimate",
    expirationDate: "",
    notes: "",
  };
}

export function itemToPantryFormValues(
  item: PantryItem | PersistedPantryItem | ContractPantryItem,
  fallbackToday?: string,
): PantryFormValues {
  const expirationKind: ExpirationFormKind =
    ("expiration" in item && item.expiration?.kind === "override") ||
    ("expirationInfo" in item && item.expirationInfo?.expiration.kind === "override")
      ? "override"
      : ("expiration" in item && item.expiration?.kind === "unknown") ||
        ("expirationInfo" in item && item.expirationInfo?.expiration.kind === "unknown")
      ? "unknown"
      : "estimate";

  const expirationDate =
    "expiration" in item && item.expiration?.kind === "override" && item.expiration.date
      ? item.expiration.date
      : "expirationInfo" in item && item.expirationInfo?.expiration.kind === "override" && item.expirationInfo.expiration.date
      ? item.expirationInfo.expiration.date
      : "expirationDate" in item && item.expirationDate
      ? item.expirationDate
      : "";

  const addedOn = item.addedOn || fallbackToday || new Date().toISOString().slice(0, 10);
  const notes = item.notes ?? ("note" in item ? item.note : "") ?? "";

  const rawUnit = item.unit;
  const unit = (unitSchema.options as readonly string[]).includes(rawUnit)
    ? (rawUnit as PantryFormValues["unit"])
    : "item";

  const rawLocation = "storageLocation" in item ? item.storageLocation : item.location;
  const storageLocation = (storageLocationSchema.options as readonly string[]).includes(rawLocation)
    ? (rawLocation as PantryFormValues["storageLocation"])
    : "Fridge";

  return {
    name: item.name,
    quantity: String(item.quantity ?? "1"),
    unit,
    storageLocation,
    addedOn,
    expirationKind,
    expirationDate,
    notes,
  };
}

export function validatePantryForm(values: PantryFormValues): {
  isValid: boolean;
  errors: PantryFormErrors;
  cleaned?: PantryCreateRequest;
} {
  const errors: PantryFormErrors = {};

  // 1. Name validation
  const trimmedName = values.name.trim();
  if (!trimmedName) {
    errors.name = "Item name is required.";
  } else if (trimmedName.length > 200) {
    errors.name = "Item name must be 200 characters or fewer.";
  }

  // 2. Quantity validation
  const rawQty = values.quantity.trim();
  if (!rawQty) {
    errors.quantity = "Quantity is required.";
  } else {
    const num = Number(rawQty);
    if (!Number.isFinite(num)) {
      errors.quantity = "Quantity must be a valid number.";
    } else if (num <= 0) {
      errors.quantity = "Quantity must be greater than zero.";
    } else if (num > 999999.999) {
      errors.quantity = "Quantity must be 999,999.999 or less.";
    } else {
      const parts = rawQty.split(".");
      if (parts.length > 1 && parts[1].length > 3) {
        errors.quantity = "Quantity can have at most 3 decimal places.";
      }
    }
  }

  // 3. Unit validation
  const unitParsed = unitSchema.safeParse(values.unit);
  if (!unitParsed.success) {
    errors.unit = "Please select a supported unit.";
  }

  // 4. Storage Location validation
  const locationParsed = storageLocationSchema.safeParse(values.storageLocation);
  if (!locationParsed.success) {
    errors.storageLocation = "Please select a valid storage location.";
  }

  // 5. Added On date validation
  const addedOnParsed = calendarDateSchema.safeParse(values.addedOn);
  if (!values.addedOn) {
    errors.addedOn = "Added date is required.";
  } else if (!addedOnParsed.success) {
    errors.addedOn = "Please enter a valid date (YYYY-MM-DD).";
  }

  // 6. Expiration intent validation
  if (values.expirationKind === "override") {
    if (!values.expirationDate) {
      errors.expirationDate = "Expiration date is required for a manual override.";
    } else {
      const dateParsed = calendarDateSchema.safeParse(values.expirationDate);
      if (!dateParsed.success) {
        errors.expirationDate = "Please enter a valid expiration date (YYYY-MM-DD).";
      }
    }
  }

  // 7. Notes validation
  if (values.notes.length > 2000) {
    errors.notes = "Notes must be 2,000 characters or fewer.";
  }

  const isValid = Object.keys(errors).length === 0;

  if (!isValid) {
    return { isValid: false, errors };
  }

  const expiration: ExpirationIntent =
    values.expirationKind === "override"
      ? { kind: "override", date: values.expirationDate }
      : values.expirationKind === "unknown"
      ? { kind: "unknown" }
      : { kind: "estimate" };

  const candidate: PantryCreateRequest = {
    name: trimmedName,
    quantity: Math.round(Number(rawQty) * 1000) / 1000,
    unit: unitParsed.data!,
    storageLocation: locationParsed.data!,
    addedOn: addedOnParsed.data!,
    expiration,
    notes: values.notes.trim() ? values.notes.trim() : null,
  };

  const schemaParsed = pantryCreateRequestSchema.safeParse(candidate);
  if (!schemaParsed.success) {
    errors.general = schemaParsed.error.issues[0]?.message || "Invalid form data.";
    return { isValid: false, errors };
  }

  return { isValid: true, errors: {}, cleaned: schemaParsed.data };
}

export function computePantryChanges(
  initial: PantryFormValues,
  current: PantryFormValues,
): { hasChanges: false; changes: Record<string, never> } | { hasChanges: true; changes: PantryChanges } {
  const changes: Record<string, unknown> = {};

  if (current.name.trim() !== initial.name.trim()) {
    changes.name = current.name.trim();
  }

  const currentNum = Math.round(Number(current.quantity) * 1000) / 1000;
  const initialNum = Math.round(Number(initial.quantity) * 1000) / 1000;
  if (currentNum !== initialNum) {
    changes.quantity = currentNum;
  }

  if (current.unit !== initial.unit) {
    changes.unit = current.unit;
    // Shared contract refinement: a unit correction requires a replacement quantity.
    if (changes.quantity === undefined) {
      changes.quantity = currentNum;
    }
  }

  if (current.storageLocation !== initial.storageLocation) {
    changes.storageLocation = current.storageLocation;
  }

  if (current.addedOn !== initial.addedOn) {
    changes.addedOn = current.addedOn;
  }

  const expirationChanged =
    current.expirationKind !== initial.expirationKind ||
    (current.expirationKind === "override" && current.expirationDate !== initial.expirationDate);

  if (expirationChanged) {
    const expiration: ExpirationIntent =
      current.expirationKind === "override"
        ? { kind: "override", date: current.expirationDate }
        : current.expirationKind === "unknown"
        ? { kind: "unknown" }
        : { kind: "estimate" };
    changes.expiration = expiration;
  }

  const currentNotes = current.notes.trim() || null;
  const initialNotes = initial.notes.trim() || null;
  if (currentNotes !== initialNotes) {
    changes.notes = currentNotes;
  }

  const hasChanges = Object.keys(changes).length > 0;
  if (!hasChanges) {
    return { hasChanges: false, changes: {} };
  }

  return { hasChanges: true, changes: pantryChangesSchema.parse(changes) };
}
