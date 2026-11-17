"use client";

import React from "react";
import { PantryDeleteModal } from "./pantry-delete-modal";
import type { PantryItem } from "./types";

export interface PantryRemoveModalProps {
  item: PantryItem | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmRemove?: (item: PantryItem) => void;
  onConfirmDelete?: (itemId: string, expectedVersion: number) => Promise<void>;
  onReloadLatest?: (item: PantryItem) => Promise<PantryItem | null> | PantryItem | null | void;
}

export function PantryRemoveModal({
  item,
  isOpen,
  onClose,
  onConfirmRemove,
  onConfirmDelete,
  onReloadLatest,
}: PantryRemoveModalProps) {
  if (!isOpen || !item) return null;

  const handleDelete = async (itemId: string, expectedVersion: number) => {
    if (onConfirmDelete) {
      await onConfirmDelete(itemId, expectedVersion);
    } else if (onConfirmRemove) {
      onConfirmRemove(item);
    }
  };

  return (
    <PantryDeleteModal
      item={item}
      isOpen={isOpen}
      onClose={onClose}
      onConfirmDelete={handleDelete}
      onReloadLatest={onReloadLatest}
    />
  );
}
