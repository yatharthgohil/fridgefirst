"use client";

import React, { useState } from "react";
import { Modal, Button, Icon } from "@/components";
import { PantryItem, StorageLocation } from "./types";
import { unitOptions } from "./mock-data";

export interface PantryEditModalProps {
  item: PantryItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedItem: PantryItem) => void;
}

export function PantryEditModal({ item, isOpen, onClose, onSave }: PantryEditModalProps) {
  if (!item) return null;

  const [draft, setDraft] = useState<PantryItem>({ ...item });

  const handleSave = () => {
    onSave(draft);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="pantry-edit-modal"
      titleId="pantry-edit-title"
    >
      <header className="pantry-edit-header">
        <div>
          <span className="review-step">
            <Icon name="pantry" size={15} /> Pantry item
          </span>
          <h2 id="pantry-edit-title">Edit {item.name}</h2>
          <p>Update the item details FridgeFirst uses for reminders and recipes.</p>
        </div>
        <Button variant="icon" onClick={onClose} aria-label="Close pantry item editor">
          <Icon name="close" />
        </Button>
      </header>

      <div className="pantry-edit-fields">
        <label className="full-field">
          <span>Item name</span>
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            autoFocus
          />
        </label>
        <label>
          <span>Quantity</span>
          <input
            inputMode="decimal"
            value={draft.quantity}
            onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
          />
        </label>
        <label>
          <span>Unit</span>
          <select
            value={draft.unit}
            onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
          >
            {unitOptions.map((unit) => (
              <option value={unit.value} key={unit.value}>
                {unit.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Storage location</span>
          <select
            value={draft.location}
            onChange={(e) =>
              setDraft({ ...draft, location: e.target.value as StorageLocation })
            }
          >
            <option value="Fridge">Fridge</option>
            <option value="Freezer">Freezer</option>
            <option value="Pantry">Pantry</option>
            <option value="Counter">Counter</option>
          </select>
        </label>
        <label>
          <span>Estimated expiration date</span>
          <input
            type="date"
            value={draft.expirationDate}
            onChange={(e) => setDraft({ ...draft, expirationDate: e.target.value })}
          />
        </label>
      </div>

      <footer className="pantry-edit-footer">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSave}>
          <Icon name="check" size={16} /> Save changes
        </Button>
      </footer>
    </Modal>
  );
}
