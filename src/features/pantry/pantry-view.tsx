"use client";

import React, { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Icon, FoodArt, ExpiryBadge } from "@/components";
import { PantryItem, formatUnit, isAttentionItem } from "./types";
import { compareByRecentlyAdded } from "./pantry-filters";
import "./pantry-forms.css";

export interface PantryViewProps {
  items: PantryItem[];
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onAddItem?: () => void;
  onAddGroceries?: () => void;
  onEditItem?: (item: PantryItem) => void;
  onDeleteItem?: (item: PantryItem) => void;
  notes?: Record<string | number, string>;
  onUpdateNote?: (id: string | number, note: string) => void;
  onSaveNote?: (id: string | number, note: string) => void | Promise<void>;
  /** Slot rendered first in each row's action area (e.g. consume/discard controls). */
  renderItemActions?: (item: PantryItem) => React.ReactNode;
  /** Slot replacing the default expiry badge in each row. */
  renderExpiration?: (item: PantryItem) => React.ReactNode;
  /**
   * Replaces the built-in tabs/sort/search. `items` must already be filtered
   * and sorted; `empty` is shown when they are empty but the pantry is not.
   */
  listControls?: {
    toolbar: React.ReactNode;
    items: PantryItem[];
    empty?: React.ReactNode;
  };
  isLoading?: boolean;
  loadError?: string | null;
  isUnauthorized?: boolean;
  onRetry?: () => void;
  onSignIn?: () => void;
  recipesCount?: number;
}

export function PantryView({
  items,
  searchQuery,
  onSearchChange,
  onAddItem,
  onAddGroceries,
  onEditItem,
  onDeleteItem,
  notes = {},
  onUpdateNote,
  onSaveNote,
  renderItemActions,
  renderExpiration,
  listControls,
  isLoading = false,
  loadError = null,
  isUnauthorized = false,
  onRetry,
  onSignIn,
  recipesCount,
}: PantryViewProps) {
  const router = useRouter();
  const [filter, setFilter] = useState("All");
  const [pantrySort, setPantrySort] = useState("expiration");
  const [internalQuery, setInternalQuery] = useState("");
  const query = searchQuery !== undefined ? searchQuery : internalQuery;
  const setQuery = onSearchChange ?? setInternalQuery;
  const [expandedNoteId, setExpandedNoteId] = useState<string | number | null>(null);

  const activeItems = useMemo(
    () => items.filter((item) => Number(item.quantity) > 0),
    [items]
  );

  const filteredItems = useMemo(() => {
    return activeItems.filter((item) => {
      const q = query.trim().toLowerCase();
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.location.toLowerCase().includes(q) ||
        Boolean(item.notes && item.notes.toLowerCase().includes(q)) ||
        Boolean(item.note && item.note.toLowerCase().includes(q));
      if (!matchesSearch) return false;

      if (filter === "All") return true;
      if (filter === "Expiring") return isAttentionItem(item);
      if (filter === "Fridge") return item.location === "Fridge";
      if (filter === "Pantry") return item.location === "Pantry";
      return true;
    });
  }, [activeItems, filter, query]);

  const sortedPantryItems = useMemo(() => {
    return [...filteredItems].sort((a, b) => {
      if (pantrySort === "alphabetical") return a.name.localeCompare(b.name);
      if (pantrySort === "added") {
        return compareByRecentlyAdded(a, b);
      }
      return a.expirationDate.localeCompare(b.expirationDate);
    });
  }, [filteredItems, pantrySort]);

  const rows = listControls ? listControls.items : sortedPantryItems;
  const shownCount = listControls ? listControls.items.length : filteredItems.length;

  const totalExpiring = activeItems.filter(isAttentionItem).length;
  const totalFridge = activeItems.filter((item) => item.location === "Fridge").length;

  return (
    <section className="full-pantry">
      <div className="pantry-page-header">
        <div>
          <span className="eyebrow">INVENTORY</span>
          <h1>My pantry</h1>
          <p>Keep track of what you have and use it while it’s fresh.</p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          {onAddItem && (
            <Button variant="secondary" onClick={onAddItem}>
              <Icon name="plus" size={18} /> Add item
            </Button>
          )}
          {onAddGroceries && (
            <Button onClick={onAddGroceries}>
              <Icon name="camera" size={18} /> Add from photo
            </Button>
          )}
        </div>
      </div>

      <div className="pantry-summary-grid">
        <article>
          <span className="summary-icon all">
            <Icon name="pantry" />
          </span>
          <div>
            <strong>{items.length}</strong>
            <span>Total items</span>
          </div>
        </article>
        <article>
          <span className="summary-icon urgent">
            <Icon name="clock" />
          </span>
          <div>
            <strong>{totalExpiring}</strong>
            <span>Expiring soon</span>
          </div>
        </article>
        <article>
          <span className="summary-icon fridge">
            <Icon name="sparkle" />
          </span>
          <div>
            <strong>{totalFridge}</strong>
            <span>In your fridge</span>
          </div>
        </article>
        <article>
          <span className="summary-icon coverage">
            <Icon name="recipes" />
          </span>
          <div>
            <strong>{items.length === 0 ? 0 : (recipesCount ?? 6)}</strong>
            <span>{items.length === 0 ? "Matching recipes" : "Recipes available"}</span>
          </div>
        </article>
      </div>

      {loadError && (
        <div className="pantry-error-banner" role="alert" aria-live="assertive">
          <Icon name="alert" size={24} />
          <div className="pantry-error-content">
            <strong className="pantry-error-title">
              {isUnauthorized ? "Session expired" : "Failed to load pantry"}
            </strong>
            <p className="pantry-error-text">{loadError}</p>
          </div>
          <div className="pantry-error-actions">
            {isUnauthorized ? (
              <Button
                variant="primary"
                onClick={onSignIn ?? (() => router.push("/login"))}
                aria-label="Sign in again to continue"
              >
                Sign in
              </Button>
            ) : onRetry ? (
              <Button
                variant="secondary"
                onClick={onRetry}
                aria-label="Retry loading pantry items"
              >
                <Icon name="refresh" size={16} /> Retry
              </Button>
            ) : null}
          </div>
        </div>
      )}

      {!isLoading && !loadError && items.length === 0 ? (
        <div className="pantry-first-empty" role="region" aria-label="Empty pantry">
          <div className="pantry-first-empty-icon" aria-hidden="true">
            <Icon name="pantry" size={38} />
          </div>
          <h3>Your pantry is empty</h3>
          <p>
            Add the ingredients and groceries you have at home to start tracking expiration dates and get personalized recipe recommendations.
          </p>
          <div className="pantry-first-empty-actions">
            {onAddItem && (
              <Button variant="primary" onClick={onAddItem} aria-label="Add an item manually">
                <Icon name="plus" size={18} /> Add item manually
              </Button>
            )}
            {onAddGroceries && (
              <Button variant="secondary" onClick={onAddGroceries} aria-label="Add items from a photo">
                <Icon name="camera" size={18} /> Add from photo
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="inventory-panel">
          {listControls ? (
            listControls.toolbar
          ) : (
            <div className="inventory-toolbar">
              <div className="inventory-tabs">
                {["All", "Expiring", "Fridge", "Pantry"].map((name) => (
                  <Button
                    key={name}
                    variant="ghost"
                    className={filter === name ? "selected" : ""}
                    onClick={() => setFilter(name)}
                  >
                    {name}
                    {name === "All" ? ` (${items.length})` : ""}
                  </Button>
                ))}
              </div>
              <div className="inventory-tools">
                <label className="sort-control">
                  <span>Sort by</span>
                  <select
                    value={pantrySort}
                    onChange={(e) => setPantrySort(e.target.value)}
                    aria-label="Sort pantry items"
                  >
                    <option value="added">Most recently added</option>
                    <option value="expiration">Soonest expiration</option>
                    <option value="alphabetical">Alphabetical</option>
                  </select>
                </label>
                <label className="inventory-search">
                  <Icon name="search" size={16} />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Find an item"
                  />
                </label>
              </div>
            </div>
          )}

          <div className="inventory-table-head">
            <span>ITEM</span>
            <span>QUANTITY</span>
            <span>ADDED</span>
            <span>EXPIRATION</span>
            <span />
          </div>

          <div className="inventory-rows">
            {isLoading && items.length === 0 ? (
              <div
                className="inventory-loading"
                role="status"
                aria-live="polite"
                aria-label="Loading pantry items"
              >
                <span className="sr-only">Loading your pantry...</span>
                <div className="skeleton-row" aria-hidden="true" />
                <div className="skeleton-row" aria-hidden="true" />
                <div className="skeleton-row" aria-hidden="true" />
              </div>
            ) : (
              rows.map((item) => {
                const itemNote = notes[item.id] !== undefined ? notes[item.id] : (item.notes ?? item.note ?? "");
                const hasNote = Boolean(itemNote?.trim());
                const noteIsExpanded = expandedNoteId === item.id;
                return (
                  <Fragment key={item.id}>
                    <article className={`inventory-row ${noteIsExpanded ? "note-open" : ""}`}>
                      <div className="inventory-item">
                        <div className={`food-thumb ${item.icon}`}>
                          <FoodArt icon={item.icon} />
                        </div>
                        <div>
                          <strong>{item.name}</strong>
                          <span>{item.location}</span>
                        </div>
                      </div>
                      <div className="inventory-quantity">
                        <strong>
                          {item.quantity} {formatUnit(item.unit, item.quantity)}
                        </strong>
                        <span>
                          <i style={{ width: `${item.amount}%` }} />
                        </span>
                      </div>
                      <span className="added-date">{item.added}</span>
                      {renderExpiration ? (
                        renderExpiration(item)
                      ) : (
                        <ExpiryBadge urgency={item.urgency} expiry={item.expiry} />
                      )}
                      <div className="inventory-actions">
                        {renderItemActions?.(item)}
                        {onEditItem && (
                          <Button variant="secondary" onClick={() => onEditItem(item)}>
                            Edit
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          className={`note-item ${hasNote ? "has-note" : ""}`}
                          onClick={() => {
                            if (noteIsExpanded) {
                              onSaveNote?.(item.id, itemNote);
                              setExpandedNoteId(null);
                            } else {
                              setExpandedNoteId(item.id);
                            }
                          }}
                          aria-label={`${hasNote ? "Edit" : "Add"} note for ${item.name}`}
                          aria-expanded={noteIsExpanded}
                        >
                          <Icon name="note" size={16} />
                          {hasNote && <span className="note-indicator" aria-hidden="true" />}
                        </Button>
                        {onDeleteItem && (
                          <Button
                            variant="ghost"
                            className="remove-item"
                            onClick={() => onDeleteItem(item)}
                            aria-label={`Remove ${item.name}`}
                          >
                            <Icon name="close" size={16} />
                          </Button>
                        )}
                      </div>
                    </article>

                    {noteIsExpanded && (
                      <div className="item-note-editor">
                        <div className="item-note-heading">
                          <span>
                            <Icon name="note" size={16} />
                          </span>
                          <div>
                            <strong>Note for {item.name}</strong>
                            <small>
                              Add storage details, meal plans, or anything you want to remember.
                            </small>
                          </div>
                        </div>
                        <textarea
                          value={itemNote}
                          onChange={(e) => onUpdateNote?.(item.id, e.target.value)}
                          placeholder="Add a note..."
                          maxLength={240}
                          aria-label={`Note for ${item.name}`}
                          autoFocus
                        />
                        <div className="item-note-footer">
                          <span>{itemNote.length}/240</span>
                          <Button
                            variant="secondary"
                            onClick={() => {
                              onSaveNote?.(item.id, itemNote);
                              setExpandedNoteId(null);
                            }}
                          >
                            Done
                          </Button>
                        </div>
                      </div>
                    )}
                  </Fragment>
                );
              })
            )}

            {!isLoading && shownCount === 0 && items.length > 0 && listControls?.empty}
            {!isLoading && shownCount === 0 && items.length > 0 && !listControls?.empty && (
              <div className="inventory-empty">
                <span>
                  <Icon name="search" />
                </span>
                <strong>No pantry items found</strong>
                <p>Try a different search or filter.</p>
              </div>
            )}
          </div>

          <div className="inventory-footer">
            <span>
              Showing {shownCount} of {items.length} items
            </span>
            <span>Inventory updated just now</span>
          </div>
        </div>
      )}
    </section>
  );
}
