"use client";

import React, { Fragment, useMemo, useState } from "react";
import { Button, Icon, FoodArt, ExpiryBadge } from "@/components";
import { PantryItem, formatUnit } from "./types";

export interface PantryViewProps {
  items: PantryItem[];
  onAddGroceries?: () => void;
  onEditItem?: (item: PantryItem) => void;
  onDeleteItem?: (item: PantryItem) => void;
  notes?: Record<number, string>;
  onUpdateNote?: (id: number, note: string) => void;
}

export function PantryView({
  items,
  onAddGroceries,
  onEditItem,
  onDeleteItem,
  notes = {},
  onUpdateNote,
}: PantryViewProps) {
  const [filter, setFilter] = useState("All");
  const [pantrySort, setPantrySort] = useState("expiration");
  const [query, setQuery] = useState("");
  const [expandedNoteId, setExpandedNoteId] = useState<number | null>(null);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(query.toLowerCase()) ||
        item.location.toLowerCase().includes(query.toLowerCase());
      if (!matchesSearch) return false;

      if (filter === "All") return true;
      if (filter === "Expiring") return item.urgency !== "fresh";
      if (filter === "Fridge") return item.location === "Fridge";
      if (filter === "Pantry") return item.location === "Pantry";
      return true;
    });
  }, [items, filter, query]);

  const sortedPantryItems = useMemo(() => {
    return [...filteredItems].sort((a, b) => {
      if (pantrySort === "alphabetical") return a.name.localeCompare(b.name);
      if (pantrySort === "added") return b.id - a.id;
      return a.expirationDate.localeCompare(b.expirationDate);
    });
  }, [filteredItems, pantrySort]);

  const totalExpiring = items.filter((item) => item.urgency !== "fresh").length;
  const totalFridge = items.filter((item) => item.location === "Fridge").length;

  return (
    <section className="full-pantry">
      <div className="pantry-page-header">
        <div>
          <span className="eyebrow">INVENTORY</span>
          <h1>My pantry</h1>
          <p>Keep track of what you have and use it while it’s fresh.</p>
        </div>
        {onAddGroceries && (
          <Button onClick={onAddGroceries}>
            <Icon name="plus" size={18} /> Add groceries
          </Button>
        )}
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
            <strong>8</strong>
            <span>Recipes available</span>
          </div>
        </article>
      </div>

      <div className="inventory-panel">
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
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find an item"
              />
            </label>
          </div>
        </div>

        <div className="inventory-table-head">
          <span>ITEM</span>
          <span>QUANTITY</span>
          <span>ADDED</span>
          <span>EXPIRATION</span>
          <span />
        </div>

        <div className="inventory-rows">
          {sortedPantryItems.map((item) => {
            const hasNote = Boolean(notes[item.id]?.trim());
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
                  <ExpiryBadge urgency={item.urgency} expiry={item.expiry} />
                  <div className="inventory-actions">
                    {onEditItem && (
                      <Button variant="secondary" onClick={() => onEditItem(item)}>
                        Edit
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      className={`note-item ${hasNote ? "has-note" : ""}`}
                      onClick={() =>
                        setExpandedNoteId(noteIsExpanded ? null : item.id)
                      }
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
                      value={notes[item.id] || ""}
                      onChange={(e) => onUpdateNote?.(item.id, e.target.value)}
                      placeholder="Add a note..."
                      maxLength={240}
                      aria-label={`Note for ${item.name}`}
                      autoFocus
                    />
                    <div className="item-note-footer">
                      <span>{(notes[item.id] || "").length}/240</span>
                      <Button
                        variant="secondary"
                        onClick={() => setExpandedNoteId(null)}
                      >
                        Done
                      </Button>
                    </div>
                  </div>
                )}
              </Fragment>
            );
          })}

          {filteredItems.length === 0 && (
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
            Showing {filteredItems.length} of {items.length} items
          </span>
          <span>Inventory updated just now</span>
        </div>
      </div>
    </section>
  );
}
