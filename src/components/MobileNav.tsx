"use client";

import React from "react";
import { Icon, IconName } from "./Icon";
import { Button } from "./Button";

export interface MobileNavProps {
  activeNav: string;
  onNavigate: (nav: string) => void;
}

export function MobileNav({ activeNav, onNavigate }: MobileNavProps) {
  const tabs: [string, IconName][] = [
    ["Overview", "home"],
    ["Pantry", "pantry"],
    ["Recipes", "recipes"],
    ["Activity", "history"],
  ];

  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {tabs.map(([label, icon]) => {
        const isActive =
          label === "Pantry"
            ? activeNav === "My pantry"
            : activeNav === label;
        return (
          <Button
            key={label}
            variant="ghost"
            className={isActive ? "active" : ""}
            onClick={() => onNavigate(label === "Pantry" ? "My pantry" : label)}
          >
            <Icon name={icon} />
            <span>{label}</span>
          </Button>
        );
      })}
    </nav>
  );
}
