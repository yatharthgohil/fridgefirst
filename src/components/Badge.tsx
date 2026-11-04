import React from "react";
import { Icon, IconName } from "./Icon";

export type UrgencyLevel = "critical" | "soon" | "fresh";

export interface ExpiryBadgeProps {
  urgency: UrgencyLevel;
  expiry: string;
  className?: string;
}

export function ExpiryBadge({ urgency, expiry, className = "" }: ExpiryBadgeProps) {
  return (
    <span className={`expiry ${urgency} ${className}`.trim()}>
      <i aria-hidden="true" />
      {expiry}
    </span>
  );
}

export interface StepBadgeProps {
  icon?: IconName;
  children: React.ReactNode;
  className?: string;
}

export function StepBadge({ icon, children, className = "" }: StepBadgeProps) {
  return (
    <span className={`review-step ${className}`.trim()}>
      {icon && <Icon name={icon} size={15} />}
      {children}
    </span>
  );
}
