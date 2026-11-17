"use client";

import React, { useState } from "react";
import { Modal, Button, Icon } from "@/components";
import { PantryApiError } from "./pantry-api";
import { formatUnit, type PantryItem } from "./types";

export interface PantryDeleteModalProps {
  item: PantryItem | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmDelete: (itemId: string, expectedVersion: number) => Promise<void>;
  onReloadLatest?: (item: PantryItem) => void;
}

export function PantryDeleteModal({
  item,
  isOpen,
  onClose,
  onConfirmDelete,
  onReloadLatest,
}: PantryDeleteModalProps) {
  if (!isOpen || !item) return null;

  return (
    <DeleteModalBody
      key={`del-${item.id}-${item.version ?? 1}`}
      item={item}
      onClose={onClose}
      onConfirmDelete={onConfirmDelete}
      onReloadLatest={onReloadLatest}
    />
  );
}

function DeleteModalBody({
  item,
  onClose,
  onConfirmDelete,
  onReloadLatest,
}: Omit<PantryDeleteModalProps, "isOpen"> & { item: PantryItem }) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isConflict, setIsConflict] = useState(false);

  const handleDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    setIsConflict(false);

    try {
      await onConfirmDelete(String(item.id), item.version ?? 1);
      onClose();
    } catch (err: unknown) {
      if (err instanceof PantryApiError && err.code === "conflict") {
        setIsConflict(true);
        setDeleteError(err.message);
      } else if (err instanceof Error) {
        setDeleteError(err.message || "Failed to remove item. Please try again.");
      } else {
        setDeleteError("Could not remove item. Check your connection and try again.");
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={isDeleting ? () => {} : onClose}
      className="remove-confirm-modal"
      role="alertdialog"
      titleId="remove-confirm-title"
    >
      <span className="remove-confirm-icon">
        <Icon name="minus" size={22} />
      </span>
      <h2 id="remove-confirm-title">Remove {item.name}?</h2>
      <p id="remove-confirm-description">
        This will remove <strong>{item.quantity} {formatUnit(item.unit, item.quantity)}</strong> from your {item.location.toLowerCase()}. This action cannot be undone.
      </p>

      {deleteError && (
        <div
          className={`pantry-alert-banner ${isConflict ? "conflict" : "error"}`}
          role="alert"
          style={{ marginBottom: "16px", textAlign: "left" }}
        >
          <div>
            <strong>{isConflict ? "Item updated elsewhere" : "Delete failed"}</strong>
            <span>{deleteError}</span>
          </div>
          {isConflict && onReloadLatest && (
            <div style={{ marginTop: "6px" }}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  onReloadLatest(item);
                  onClose();
                }}
                style={{ fontSize: "10px", padding: "4px 8px" }}
              >
                Review current values
              </Button>
            </div>
          )}
        </div>
      )}

      <div>
        <Button
          variant="secondary"
          onClick={onClose}
          disabled={isDeleting}
        >
          Cancel
        </Button>
        <Button
          className="confirm-remove-button"
          onClick={handleDelete}
          disabled={isDeleting}
        >
          {isDeleting ? "Removing..." : "Remove item"}
        </Button>
      </div>
    </Modal>
  );
}
