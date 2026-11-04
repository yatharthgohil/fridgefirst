import React from "react";

export interface QuantityMeterProps {
  amount: number;
  className?: string;
}

export function QuantityMeter({ amount, className = "" }: QuantityMeterProps) {
  const clampedAmount = Math.max(0, Math.min(100, amount));
  return (
    <div className={`quantity-meter ${className}`.trim()}>
      <span>
        <i style={{ width: `${clampedAmount}%` }} />
      </span>
      <small>{clampedAmount}% left</small>
    </div>
  );
}
