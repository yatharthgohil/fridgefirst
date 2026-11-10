"use client";

import React, { useId, useMemo, useState } from "react";
import { Button, Icon } from "@/components";
import {
  DEFAULT_PANTRY_FILTERS,
  EXPIRATION_FILTERS,
  PANTRY_SORTS,
  STORAGE_LOCATIONS,
  applyPantryFilters,
  clearPantryFilters,
  countByExpirationFilter,
  hasActiveFilters,
  toggleExpirationFilter,
  type ExpirationFilter,
  type PantryFilterState,
  type PantrySort,
} from "./pantry-filters";
import type { PantryItem, StorageLocation } from "./types";
import "./expiration.css";

/**
 * Filter state + derived list for a pantry. Results are recomputed from
 * `items` on every render, so refreshed quantities, date edits and overrides
 * immediately update badges, counts and which items match.
 */
export function usePantryFilters(items: PantryItem[], initial: PantryFilterState = DEFAULT_PANTRY_FILTERS) {
  const [filters, setFilters] = useState<PantryFilterState>(initial);
  const visibleItems = useMemo(() => applyPantryFilters(items, filters), [items, filters]);
  const counts = useMemo(() => countByExpirationFilter(items, filters), [items, filters]);
  return {
    filters,
    setFilters,
    visibleItems,
    counts,
    total: items.length,
    active: hasActiveFilters(filters),
    clear: () => setFilters((current) => clearPantryFilters(current)),
  };
}

export interface PantryFilterBarProps {
  filters: PantryFilterState;
  onChange: (next: PantryFilterState) => void;
  counts: Record<ExpirationFilter, number>;
  shown: number;
  total: number;
}

export function PantryFilterBar({ filters, onChange, counts, shown, total }: PantryFilterBarProps) {
  const ids = useId();
  const active = hasActiveFilters(filters);

  return (
    <div className="inventory-toolbar pantry-filter-bar" role="search" aria-label="Filter pantry items">
      <div className="pantry-filter-row">
        <label className="inventory-search">
          <Icon name="search" size={16} />
          <span className="visually-hidden">Search pantry</span>
          <input
            type="search"
            value={filters.query}
            onChange={(event) => onChange({ ...filters, query: event.target.value })}
            placeholder="Find an item"
          />
        </label>
        <label className="sort-control">
          <span>Location</span>
          <select
            value={filters.location}
            onChange={(event) => onChange({ ...filters, location: event.target.value as StorageLocation | "all" })}
          >
            <option value="all">All locations</option>
            {STORAGE_LOCATIONS.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>
        </label>
        <label className="sort-control">
          <span>Sort by</span>
          <select
            value={filters.sort}
            onChange={(event) => onChange({ ...filters, sort: event.target.value as PantrySort })}
          >
            {PANTRY_SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="pantry-filter-row">
        <div className="pantry-filter-chips" role="group" aria-labelledby={`${ids}-chips`}>
          <span id={`${ids}-chips`} className="pantry-filter-label">
            Show
          </span>
          {EXPIRATION_FILTERS.map((option) => {
            const pressed = filters.expiration.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                className={`pantry-chip chip-${option.value}`}
                aria-pressed={pressed}
                onClick={() => onChange(toggleExpirationFilter(filters, option.value))}
              >
                {pressed && <Icon name="check" size={13} />}
                {option.label}
                <span className="pantry-chip-count">
                  {counts[option.value]}
                  <span className="visually-hidden"> items</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="pantry-filter-summary">
          <span role="status" aria-live="polite">
            {active ? `${shown} of ${total} items match` : `${total} items`}
          </span>
          {active && (
            <Button variant="ghost" className="pantry-clear" onClick={() => onChange(clearPantryFilters(filters))}>
              Clear filters
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function PantryNoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="inventory-empty">
      <span>
        <Icon name="search" />
      </span>
      <strong>No items match these filters</strong>
      <p>Try removing a filter, or clear them all to see your whole pantry.</p>
      <Button variant="secondary" className="pantry-empty-clear" onClick={onClear}>
        Clear filters
      </Button>
    </div>
  );
}
