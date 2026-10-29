"use client";

import React, { useState, useMemo } from "react";
import { Modal, Button, Icon, FoodArt } from "@/components";
import { StorageLocation } from "@/features/pantry/types";
import { unitOptions } from "@/features/pantry/mock-data";
import { DetectedGrocery } from "./types";

export interface ScanReviewModalProps {
  isOpen: boolean;
  detectedItems: DetectedGrocery[];
  onClose: () => void;
  onChooseDifferentPhoto: () => void;
  onConfirm: (confirmedItems: DetectedGrocery[]) => void;
}

export function ScanReviewModal({
  isOpen,
  detectedItems: initialItems,
  onClose,
  onChooseDifferentPhoto,
  onConfirm,
}: ScanReviewModalProps) {
  const [items, setItems] = useState<DetectedGrocery[]>([...initialItems]);

  const updateItem = <K extends keyof DetectedGrocery>(
    id: number,
    field: K,
    value: DetectedGrocery[K]
  ) => {
    setItems((curr) =>
      curr.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const toggleSelect = (id: number) => {
    setItems((curr) =>
      curr.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item))
    );
  };

  const selectedCount = items.filter((item) => item.selected).length;

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => a.confidence - b.confidence);
  }, [items]);

  const handleConfirm = () => {
    const selected = items.filter((item) => item.selected);
    onConfirm(selected);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="review-modal"
      titleId="review-title"
    >
      <header className="review-modal-header">
        <div>
          <span className="review-step">
            <Icon name="sparkle" size={15} /> Photo analyzed
          </span>
          <h2 id="review-title">Check your groceries</h2>
          <p>Confirm what we found and correct anything that doesn’t look right.</p>
        </div>
        <Button variant="icon" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </Button>
      </header>

      <div className="detected-summary">
        <div className="detected-stack">
          {items.slice(0, 4).map((item) => (
            <div className={`food-thumb ${item.icon}`} key={item.id}>
              <FoodArt icon={item.icon} />
            </div>
          ))}
        </div>
        <div>
          <strong>{items.length} items identified</strong>
          <span>{selectedCount} selected to add</span>
        </div>
        <span className="review-hint">Review before saving</span>
      </div>

      <div className="detected-list">
        <div className="detected-list-head">
          <span>ITEM</span>
          <span>QUANTITY</span>
          <span>UNIT</span>
          <span>STORAGE</span>
          <span>EST. EXPIRATION</span>
        </div>
        {sortedItems.map((item) => (
          <div
            className={`detected-row ${!item.selected ? "is-disabled" : ""}`}
            key={item.id}
          >
            <label className="item-check">
              <input
                type="checkbox"
                checked={item.selected}
                onChange={() => toggleSelect(item.id)}
              />
              <span>
                <Icon name="check" size={13} />
              </span>
            </label>
            <div className={`food-thumb ${item.icon}`}>
              <FoodArt icon={item.icon} />
            </div>
            <div className="detected-name">
              <input
                value={item.name}
                onChange={(e) => updateItem(item.id, "name", e.target.value)}
                aria-label={`Name for ${item.name}`}
              />
              <small className={item.confidence < 80 ? "low-confidence" : ""}>
                {item.confidence}% match
                {item.confidence < 80 ? " · Please check" : ""}
              </small>
            </div>
            <label className="detected-field quantity-field">
              <span>Quantity</span>
              <input
                className="detail-input"
                inputMode="decimal"
                value={item.quantity}
                onChange={(e) => updateItem(item.id, "quantity", e.target.value)}
                aria-label={`Quantity for ${item.name}`}
              />
            </label>
            <label className="detected-field unit-field">
              <span>Unit</span>
              <select
                className="detail-input"
                value={item.unit}
                onChange={(e) => updateItem(item.id, "unit", e.target.value)}
                aria-label={`Unit for ${item.name}`}
              >
                {unitOptions.map((unit) => (
                  <option value={unit.value} key={unit.value}>
                    {unit.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="detected-field storage-field">
              <span>Storage</span>
              <select
                className="detail-input"
                value={item.location}
                onChange={(e) =>
                  updateItem(item.id, "location", e.target.value as StorageLocation)
                }
                aria-label={`Storage for ${item.name}`}
              >
                <option value="Fridge">Fridge</option>
                <option value="Freezer">Freezer</option>
                <option value="Pantry">Pantry</option>
                <option value="Counter">Counter</option>
              </select>
            </label>
            <label className="detected-field expiration-field">
              <span>Est. expiration</span>
              <input
                className="detail-input"
                type="date"
                value={item.expirationDate}
                onChange={(e) => updateItem(item.id, "expirationDate", e.target.value)}
                aria-label={`Estimated expiration date for ${item.name}`}
              />
            </label>
          </div>
        ))}
      </div>

      <div className="review-modal-footer">
        <Button variant="ghost" onClick={onChooseDifferentPhoto}>
          Choose a different photo
        </Button>
        <div>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={selectedCount === 0} onClick={handleConfirm}>
            <Icon name="check" size={17} /> Confirm {selectedCount} items
          </Button>
        </div>
      </div>
    </Modal>
  );
}
