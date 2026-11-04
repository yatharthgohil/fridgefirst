"use client";

import React from "react";
import { Button } from "@/components";

export interface CookingStatusBarProps {
  currentStep: number;
  totalSteps: number;
  stepTitle?: string;
  timerFormatted?: string;
  isPaused?: boolean;
  onTogglePause?: () => void;
}

export function CookingStatusBar({
  currentStep,
  totalSteps,
  stepTitle = "Prep ingredients",
  timerFormatted = "04:12",
  isPaused = false,
  onTogglePause,
}: CookingStatusBarProps) {
  return (
    <div className="cooking-status">
      <span className="live-dot" />
      <div>
        <strong>Cooking plan active</strong>
        <span>
          Step {currentStep} of {totalSteps} · {stepTitle}
        </span>
      </div>
      <div className="cook-timer">{timerFormatted}</div>
      {onTogglePause && (
        <Button variant="secondary" onClick={onTogglePause}>
          {isPaused ? "Resume" : "Pause"}
        </Button>
      )}
    </div>
  );
}
