"use client";

import React, { useId, useRef, useState } from "react";
import { Button, Icon, Modal } from "@/components";
import type { ExpirationMeta } from "@/contracts/expiration";
import { describeExpiration, explainExpiration, formatCalendarDate } from "./expiration-display";
import type { PantryItem } from "./types";
import "./expiration.css";

const TONE_SYMBOL: Record<string, string> = { unknown: "?", past: "!", soon: "", ok: "" };

export interface ExpirationBadgeProps {
  expiration: ExpirationMeta;
  className?: string;
}

/**
 * Text-labelled expiration badge. Status and source are always written out,
 * so meaning never depends on color alone.
 */
export function ExpirationBadge({ expiration, className = "" }: ExpirationBadgeProps) {
  const display = describeExpiration(expiration);
  return (
    <span
      className={`exp-badge exp-${display.tone} ${className}`.trim()}
      title={display.description}
      data-status={expiration.status}
      data-source={expiration.source}
    >
      <i className="exp-dot" aria-hidden="true">
        {TONE_SYMBOL[display.tone]}
      </i>
      <span className="exp-copy">
        <span className="exp-label">{display.label}</span>
        {display.tag && <span className="exp-tag">{display.tag}</span>}
      </span>
      <span className="visually-hidden">{` — ${display.description}`}</span>
    </span>
  );
}

export interface ExpirationStatusProps {
  item: PantryItem;
  expiration: ExpirationMeta;
  /** Opens the item editor (Amy's PantryEditModal). Shown as "Change date". */
  onEditItem?: (item: PantryItem) => void;
}

/**
 * Badge that opens an explanation of where the date came from, with an
 * action into the item editor to change or add the date.
 */
export function ExpirationStatus({ item, expiration, onEditItem }: ExpirationStatusProps) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const display = describeExpiration(expiration);

  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => trigger.current?.focus());
  };

  return (
    <>
      <button
        type="button"
        // `expiry` reuses the dashboard's grid placement for the badge cell.
        className="expiry exp-trigger"
        onClick={(event) => {
          trigger.current = event.currentTarget;
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-label={`${item.name}: ${display.description} Show date details`}
      >
        <ExpirationBadge expiration={expiration} />
      </button>
      {open && (
        <ExpirationDetailsDialog
          item={item}
          expiration={expiration}
          onClose={() => close()}
          onEdit={
            onEditItem
              ? () => {
                  close(false);
                  onEditItem(item);
                }
              : undefined
          }
        />
      )}
    </>
  );
}

function ExpirationDetailsDialog({
  item,
  expiration,
  onClose,
  onEdit,
}: {
  item: PantryItem;
  expiration: ExpirationMeta;
  onClose: () => void;
  onEdit?: () => void;
}) {
  const titleId = useId();
  const lines = explainExpiration(expiration);
  const unknown = expiration.date === null;
  const heading =
    expiration.date === null
      ? "No date"
      : `${expiration.source === "override" ? "Your date" : "Estimated date"}: ${formatCalendarDate(expiration.date)}`;

  return (
    <Modal isOpen onClose={onClose} className="exp-dialog" titleId={titleId}>
      <header>
        <div>
          <span className="eyebrow">{item.name.toUpperCase()}</span>
          <h2 id={titleId}>{heading}</h2>
        </div>
        <Button variant="icon" onClick={onClose} aria-label="Close date details">
          <Icon name="close" />
        </Button>
      </header>
      <div className="exp-dialog-body">
        <ExpirationBadge expiration={expiration} />
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      <footer>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        {onEdit && (
          <Button onClick={onEdit} autoFocus>
            <Icon name={unknown ? "plus" : "settings"} size={15} /> {unknown ? "Add a date" : "Change date"}
          </Button>
        )}
      </footer>
    </Modal>
  );
}
