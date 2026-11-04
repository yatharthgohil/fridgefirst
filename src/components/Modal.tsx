"use client";

import React, { useEffect, useCallback } from "react";
import { Icon } from "./Icon";
import { Button } from "./Button";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  titleId?: string;
  ariaLabel?: string;
  className?: string;
  backdropClassName?: string;
  role?: "dialog" | "alertdialog";
  showCloseButton?: boolean;
  children: React.ReactNode;
}

export function Modal({
  isOpen,
  onClose,
  titleId,
  ariaLabel,
  className = "",
  backdropClassName = "",
  role = "dialog",
  showCloseButton = false,
  children,
}: ModalProps) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      className={`modal-backdrop ${backdropClassName}`.trim()}
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className={className}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-label={ariaLabel}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {showCloseButton && (
          <Button
            variant="icon"
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="close" />
          </Button>
        )}
        {children}
      </section>
    </div>
  );
}
