"use client";

import React, { useEffect, useRef } from "react";
import { Icon } from "./Icon";
import { Button } from "./Button";

export interface TopbarProps {
  query: string;
  onQueryChange: (query: string) => void;
  onSubmitSearch?: () => void;
  onOpenUpload: () => void;
}

export function Topbar({ query, onQueryChange, onSubmitSearch, onOpenUpload }: TopbarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <header className="topbar">
      <div className="mobile-brand">
        <img className="brand-logo" src="/fridgefirst-leaves.png" alt="" />
        <strong>FridgeFirst</strong>
      </div>
      <label className="search-box">
        <Icon name="search" size={18} />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onSubmitSearch?.();
            }
          }}
          placeholder="Search your pantry"
          aria-label="Search your pantry"
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
