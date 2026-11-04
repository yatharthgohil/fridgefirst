"use client";

import React from "react";
import { Modal, Button, Icon } from "@/components";
import { PantryItem } from "./types";

export interface PantryRemoveModalProps {
  item: PantryItem | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmRemove: (item: PantryItem) => void;
}

export function PantryRemoveModal({
  item,
  isOpen,
  onClose,
  onConfirmRemove,
}: PantryRemoveModalProps) {
  if (!item) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="remove-confirm-modal"
      role="alertdialog"
      titleId="remove-confirm-title"
    >
      <span className="remove-confirm-icon">
        <Icon name="minus" size={22} />
      </span>
      <h2 id="remove-confirm-title">Remove {item.name}?</h2>
      <p id="remove-confirm-description">
        This item and its note will be removed from your pantry.
      </p>
      <div>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          className="confirm-remove-button"
          onClick={() => {
            onConfirmRemove(item);
            onClose();
          }}
        >
          Remove item
        </Button>
      </div>
    </Modal>
  );
}
