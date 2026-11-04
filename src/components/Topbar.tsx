"use client";

import React from "react";
import { Icon } from "./Icon";
import { Button } from "./Button";

export interface TopbarProps {
  query: string;
  onQueryChange: (query: string) => void;
  onOpenUpload: () => void;
}

export function Topbar({ query, onQueryChange, onOpenUpload }: TopbarProps) {
  return (
    <header className="topbar">
      <div className="mobile-brand">
        <img className="brand-logo" src="/fridgefirst-leaves.png" alt="" />
        <strong>FridgeFirst</strong>
      </div>
      <label className="search-box">
        <Icon name="search" size={18} />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search your pantry"
        />
        <kbd>⌘ K</kbd>
      </label>
      <div className="top-actions">
        <Button onClick={onOpenUpload}>
          <Icon name="plus" size={18} /> Add groceries
        </Button>
      </div>
    </header>
  );
}
