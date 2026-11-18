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
  onReloadLatest?: (item: PantryItem) => Promise<PantryItem | null> | PantryItem | null | void;
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
      key={`del-${item.id}`}
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
  const [currentItem, setCurrentItem] = useState<PantryItem>(item);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isConflict, setIsConflict] = useState(false);

  const handleDelete = async () => {
    if (isDeleting || isReloading) return;
    setIsDeleting(true);
    setDeleteError(null);
    setIsConflict(false);

    try {
      await onConfirmDelete(String(currentItem.id), currentItem.version ?? 1);
      onClose();
    } catch (err: unknown) {
      if (err instanceof PantryApiError && err.code === "conflict") {
        setIsConflict(true);
        setDeleteError(err.message || "This item was changed elsewhere since you opened it.");
      } else if (err instanceof Error) {
        setDeleteError(err.message || "Failed to remove item. Please try again.");
      } else {
        setDeleteError("Could not remove item. Check your connection and try again.");
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleReload = async () => {
    if (!onReloadLatest || isReloading) return;
    setIsReloading(true);
    try {
      const fresh = await onReloadLatest(currentItem);
      if (fresh) {
        setCurrentItem(fresh);
        setIsConflict(false);
        setDeleteError(null);
      } else if (fresh === null) {
        onClose();
      }
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Could not reload item. Please try again.");
    } finally {
      setIsReloading(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={isDeleting || isReloading ? () => {} : onClose}
      className="remove-confirm-modal"
      role="alertdialog"
      titleId="remove-confirm-title"
    >
      <span className="remove-confirm-icon">
        <Icon name="minus" size={22} />
      </span>
      <h2 id="remove-confirm-title">Remove {currentItem.name}?</h2>
      <p id="remove-confirm-description">
        This will remove <strong>{currentItem.quantity} {formatUnit(currentItem.unit, currentItem.quantity)}</strong> from your {currentItem.location.toLowerCase()}. This action cannot be undone.
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
                onClick={handleReload}
                disabled={isReloading}
                style={{ fontSize: "10px", padding: "4px 8px" }}
              >
                {isReloading ? "Reloading…" : "Review current values"}
              </Button>
            </div>
          )}
        </div>
      )}

      <div>
        <Button
          variant="secondary"
          onClick={onClose}
          disabled={isDeleting || isReloading}
        >
          Cancel
        </Button>
        <Button
          className="confirm-remove-button"
          onClick={handleDelete}
          disabled={isDeleting || isReloading}
        >
          {isDeleting ? "Removing..." : "Remove item"}
        </Button>
      </div>
    </Modal>
  );
}
