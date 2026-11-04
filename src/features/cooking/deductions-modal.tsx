"use client";

import React, { useState } from "react";
import { Button, Icon } from "@/components";
import { PantryDeduction } from "./types";
import { unitOptions } from "@/features/pantry/mock-data";

export interface DeductionsModalProps {
  isOpen: boolean;
  deductions: PantryDeduction[];
  onClose: () => void;
  onConfirm: (confirmedDeductions: PantryDeduction[]) => void;
}

export function DeductionsModal({
  isOpen,
  deductions: initialDeductions,
  onClose,
  onConfirm,
}: DeductionsModalProps) {
  if (!isOpen) return null;

  const [deductions, setDeductions] = useState<PantryDeduction[]>([...initialDeductions]);

  return (
    <div className="deduction-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="deduction-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="deduction-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className="deduction-icon">
          <Icon name="pantry" size={24} />
        </span>
        <h3 id="deduction-title">Update your pantry?</h3>
        <p>Review and edit what was used. Nothing changes until you confirm.</p>
        <div className="deduction-list">
          <div className="deduction-list-head">
            <span>INGREDIENT</span>
            <span>AMOUNT USED</span>
          </div>
          {deductions.map((deduction, index) => (
            <div className="deduction-row" key={deduction.ingredient}>
              <span>{deduction.ingredient}</span>
              <div className="deduction-value">
                <span aria-hidden="true">−</span>
                <input
                  inputMode="decimal"
                  value={deduction.quantity}
                  onChange={(event) =>
                    setDeductions((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index
                          ? { ...entry, quantity: event.target.value }
                          : entry
                      )
                    )
                  }
                  aria-label={`Quantity of ${deduction.ingredient} used`}
                />
                <select
                  value={deduction.unit}
                  onChange={(event) =>
                    setDeductions((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index
                          ? { ...entry, unit: event.target.value }
                          : entry
                      )
                    )
                  }
                  aria-label={`Unit for ${deduction.ingredient} deduction`}
                >
                  {unitOptions.map((unit) => (
                    <option value={unit.value} key={unit.value}>
                      {unit.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
        <div className="deduction-actions">
          <Button variant="secondary" onClick={onClose}>
            Keep cooking
          </Button>
          <Button onClick={() => onConfirm(deductions)}>Confirm deductions</Button>
        </div>
      </section>
    </div>
  );
}
