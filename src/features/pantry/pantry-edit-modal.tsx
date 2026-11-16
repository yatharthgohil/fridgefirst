"use client";

import React from "react";
import type { PantryUpdateRequest } from "@/contracts/pantry";
import { PantryFormModal } from "./pantry-form-modal";
import type { PantryItem } from "./types";

export interface PantryEditModalProps {
  item: PantryItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave?: (updatedItem: PantryItem) => void;
  onSubmitEdit?: (itemId: string, request: PantryUpdateRequest) => Promise<void>;
  onReloadLatest?: (item: PantryItem) => void;
}

export function PantryEditModal({
  item,
  isOpen,
  onClose,
  onSave,
  onSubmitEdit,
  onReloadLatest,
}: PantryEditModalProps) {
  if (!isOpen || !item) return null;

  const handleEditSubmit = async (itemId: string, request: PantryUpdateRequest) => {
    if (onSubmitEdit) {
      await onSubmitEdit(itemId, request);
    } else if (onSave) {
      // Compatibility fallback
      const updated: PantryItem = {
        ...item,
        name: request.changes.name ?? item.name,
        quantity: request.changes.quantity !== undefined ? String(request.changes.quantity) : item.quantity,
        unit: request.changes.unit ?? item.unit,
        location: request.changes.storageLocation ?? item.location,
        addedOn: request.changes.addedOn ?? item.addedOn,
        notes: request.changes.notes !== undefined ? request.changes.notes : item.notes,
        version: (item.version ?? 1) + 1,
      };
      if (request.changes.expiration?.kind === "override") {
        updated.expirationDate = request.changes.expiration.date;
      } else if (request.changes.expiration?.kind === "unknown") {
        updated.expirationDate = "";
      }
      onSave(updated);
    }
  };

  return (
    <PantryFormModal
      isOpen={isOpen}
      mode="edit"
      item={item}
      onClose={onClose}
      onSubmitEdit={handleEditSubmit}
      onReloadLatest={onReloadLatest}
    />
  );
}
