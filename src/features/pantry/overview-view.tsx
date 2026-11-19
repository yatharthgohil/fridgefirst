"use client";

import React, { useState, useMemo } from "react";
import { Button, Icon, FoodArt, ExpiryBadge, QuantityMeter } from "@/components";
import { PantryItem, formatUnit, isAttentionItem, isPastDateItem } from "./types";

export interface OverviewViewProps {
  userName?: string;
  items: PantryItem[];
  searchQuery?: string;
  onOpenRecipe?: (recipeId: number, startCooking?: boolean) => void;
  onNavigate?: (pageName: string) => void;
  onNavigateToItem?: (item: PantryItem) => void;
  onEditItem?: (item: PantryItem) => void;
  onNotice?: (msg: string) => void;
  /** Slot replacing the static "Pantry activity" block (e.g. RecentActivityPanel). */
  activityPanel?: React.ReactNode;
  /** Slot replacing the default expiry badge in the item list. */
  renderExpiration?: (item: PantryItem) => React.ReactNode;
}

export function OverviewView({
  userName = "Alex",
  items,
  searchQuery = "",
  onOpenRecipe,
  onNavigate,
  onNavigateToItem,
  onEditItem,
  onNotice,
  activityPanel,
  renderExpiration,
}: OverviewViewProps) {
  void onNotice;
  const [filter, setFilter] = useState("All");

  const activeItems = useMemo(
    () => items.filter((item) => Number(item.quantity) > 0),
    [items]
  );

  const overviewPantryItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeItems.filter((item) => {
      if (q) {
        const matches =
          item.name.toLowerCase().includes(q) ||
          item.location.toLowerCase().includes(q) ||
          Boolean(item.notes && item.notes.toLowerCase().includes(q)) ||
          Boolean(item.note && item.note.toLowerCase().includes(q));
        if (!matches) return false;
      }
      if (filter === "All") return true;
      if (filter === "Expiring") return isAttentionItem(item);
      if (filter === "Pantry") return item.location === "Pantry";
      return true;
    });
  }, [activeItems, filter, searchQuery]);

  const displayedPantryItems = useMemo(() => {
    return searchQuery && searchQuery.trim() ? overviewPantryItems : overviewPantryItems.slice(0, 4);
  }, [overviewPantryItems, searchQuery]);

  const expiringCount = useMemo(
    () => activeItems.filter(isAttentionItem).length,
    [activeItems]
  );

  const urgentIngredients = useMemo(
    () => activeItems.filter(isAttentionItem).slice(0, 2),
    [activeItems]
  );

  const mostUrgentItem = useMemo(() => {
    return (
      activeItems.find(isPastDateItem) ??
      activeItems.find((i) => i.urgency === "critical") ??
      activeItems.find((i) => i.urgency === "soon") ??
      activeItems[0] ??
      null
    );
  }, [activeItems]);

  return (
    <>
      <section className="welcome-row">
        <div>
          <div className="date-label">MONDAY, MAY 19</div>
          <h1>Good afternoon, {userName}.</h1>
          <p>Here’s what to use next, before it goes to waste.</p>
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="left-column">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{items.length > 0 ? "COOK NEXT" : "FEATURED"}</span>
              <h2>{items.length > 0 ? "Tonight’s best match" : "Tonight’s suggestion"}</h2>
            </div>
            <Button
              variant="ghost"
              className="text-link"
              onClick={() => onNavigate?.("Recipes")}
            >
              See all recipes <Icon name="arrow" size={16} />
            </Button>
          </div>

          <article className="recipe-card">
            <div className="recipe-image">
              <img
                src="https://images.unsplash.com/photo-1623428188474-b1d532c5e560?auto=format&fit=crop&w=1000&q=85"
                alt="A colorful vegetable and rice bowl"
              />
              {items.length > 0 ? (
                <span className="match-pill">
                  <Icon name="sparkle" size={14} /> 96% pantry match
                </span>
              ) : (
                <span className="match-pill suggestion-pill">
                  <Icon name="sparkle" size={14} /> Suggested recipe
                </span>
              )}
            </div>
            <div className="recipe-content">
              <div className="recipe-kicker">
                {items.length > 0 && urgentIngredients.length > 0 ? (
                  <>
                    USE THESE FIRST{" "}
                    {urgentIngredients.map((item) => (
                      <span key={item.id}>{item.name}</span>
                    ))}
                  </>
                ) : (
                  <>
                    FEATURED RECIPE <span>Quick &amp; fresh</span>
                  </>
                )}
              </div>
              <h3>
                Crispy chickpea &amp;
                <br />
                green goddess bowls
              </h3>
              <p className="recipe-description">
                Roasted chickpeas and broccoli with a bright, creamy herb dressing.
              </p>
              <div className="recipe-meta">
                <span>
                  <Icon name="clock" size={17} /> 32 min
                </span>
                <span>
                  <Icon name="users" size={17} /> 2 servings
                </span>
                <span className="difficulty">EASY</span>
              </div>
              <div className="timeline-preview">
                <div className="timeline-head">
                  <strong>Your smart cooking plan</strong>
                  <span>Saves ~9 min</span>
                </div>
                <div className="timeline-track">
                  <span className="segment prep">Prep · 8m</span>
                  <span className="segment roast">Roast · 18m</span>
                  <span className="segment clean">Quick clean</span>
                  <span className="finish-dot" />
                </div>
              </div>
              <Button
                className="start-button"
                onClick={() => onOpenRecipe?.(1, true)}
              >
                Start cooking <Icon name="arrow" size={18} />
              </Button>
            </div>
          </article>

          <div className="section-heading pantry-heading">
            <div>
              <span className="eyebrow">YOUR PANTRY</span>
              <h2>Use it while it’s fresh</h2>
            </div>
            <div className="filter-tabs">
              {["All", "Expiring", "Pantry"].map((name) => (
                <Button
                  key={name}
                  variant="ghost"
                  className={filter === name ? "selected" : ""}
                  onClick={() => setFilter(name)}
                >
                  {name}
                </Button>
              ))}
            </div>
          </div>
          <div className="pantry-list">
            {displayedPantryItems.map((item) => (
              <article className="pantry-row" key={item.id}>
                <div className={`food-thumb ${item.icon}`}>
                  <FoodArt icon={item.icon} />
                </div>
                <div className="item-info">
                  <strong>{item.name}</strong>
                  <span>
                    {item.quantity} {formatUnit(item.unit, item.quantity)} · {item.location}
                  </span>
                </div>
                <QuantityMeter amount={item.amount} />
                {renderExpiration ? (
                  renderExpiration(item)
                ) : (
                  <ExpiryBadge urgency={item.urgency} expiry={item.expiry} />
                )}
                {onEditItem && (
                  <Button
                    variant="ghost"
                    className="item-menu"
                    aria-label={`Edit ${item.name}`}
                    onClick={() => onEditItem({ ...item })}
                  >
                    •••
                  </Button>
                )}
              </article>
            ))}
            {items.length === 0 && (
              <div className="empty-state">
                <p>Your pantry is empty.</p>
                {onNavigate && (
                  <Button variant="secondary" onClick={() => onNavigate("My pantry")}>
                    Add items
                  </Button>
                )}
              </div>
            )}
            {items.length > 0 && overviewPantryItems.length === 0 && (
              <div className="empty-state">No pantry items match your search.</div>
            )}
          </div>
          <Button
            variant="secondary"
            className="view-pantry"
            onClick={() => onNavigate?.("My pantry")}
          >
            {items.length > 0
              ? searchQuery && searchQuery.trim()
                ? `View ${overviewPantryItems.length} matching in pantry`
                : `View all ${items.length} pantry items`
              : "Open pantry"} <Icon name="arrow" size={17} />
          </Button>
        </div>

        <aside className="right-column">
          <div className="side-section-heading">
            <div>
              <span className="eyebrow">UP NEXT</span>
              <h2>Needs attention</h2>
            </div>
            <span className={`count-badge ${expiringCount === 0 ? "all-clear" : ""}`}>
              {expiringCount}
            </span>
          </div>
          {mostUrgentItem && isAttentionItem(mostUrgentItem) ? (
            <div
              className={`attention-card ${
                isPastDateItem(mostUrgentItem) || mostUrgentItem.urgency === "critical"
                  ? "critical-card"
                  : "soon-card"
              }`}
            >
              <div className="attention-top">
                <div className={`food-thumb ${mostUrgentItem.icon}`}>
                  <FoodArt icon={mostUrgentItem.icon} />
                </div>
                <div>
                  <span className="alert-label">
                    {isPastDateItem(mostUrgentItem)
                      ? "PAST DATE"
                      : mostUrgentItem.urgency === "critical"
                      ? "USE TODAY"
                      : "USE SOON"}
                  </span>
                  <strong>{mostUrgentItem.name}</strong>
                  <small>
                    {isPastDateItem(mostUrgentItem)
                      ? mostUrgentItem.expiry || "Past date"
                      : mostUrgentItem.expiry || `Added ${mostUrgentItem.added}`}
                  </small>
                </div>
              </div>
              <p>
                {isPastDateItem(mostUrgentItem)
                  ? "This item has passed its expiration date. Check the food before deciding to use or discard."
                  : "Prioritize using this item before it passes its peak freshness."}
              </p>
              <div className="attention-actions">
                {onNavigateToItem ? (
                  <Button
                    variant="secondary"
                    onClick={() => onNavigateToItem(mostUrgentItem)}
                    aria-label={`View ${mostUrgentItem.name} in pantry`}
                  >
                    View in pantry <Icon name="arrow" size={14} />
                  </Button>
                ) : onEditItem ? (
                  <Button
                    variant="secondary"
                    onClick={() => onEditItem(mostUrgentItem)}
                    aria-label={`Edit ${mostUrgentItem.name}`}
                  >
                    Edit
                  </Button>
                ) : null}
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="attention-card empty-card">
              <div className="attention-top">
                <div className="food-thumb leaf">
                  <FoodArt icon="leaf" />
                </div>
                <div>
                  <span className="alert-label neutral">ALL CLEAR</span>
                  <strong>No items need attention</strong>
                  <small>Your pantry is currently empty</small>
                </div>
              </div>
              <p>Add ingredients and groceries to start tracking expiration dates and prevent waste.</p>
              <div className="attention-actions">
                {onNavigate && (
                  <Button onClick={() => onNavigate("My pantry")}>
                    Go to pantry <Icon name="arrow" size={16} />
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="attention-card empty-card">
              <div className="attention-top">
                <div className="food-thumb leaf">
                  <FoodArt icon="leaf" />
                </div>
                <div>
                  <span className="alert-label neutral">ALL FRESH</span>
                  <strong>Everything looks good</strong>
                  <small>No items need immediate use</small>
                </div>
              </div>
              <p>All items in your pantry are fresh! Plan ahead to enjoy them at peak quality.</p>
            </div>
          )}
          {activityPanel ?? (
            <>
            <div className="side-section-heading activity-title">
              <div>
                <span className="eyebrow">RECENT</span>
                <h2>Pantry activity</h2>
              </div>
            </div>
            <div className="activity-list">
              <div className="activity-item">
                <span className="activity-icon added">
                  <Icon name="plus" size={15} />
                </span>
                <div>
                  <strong>4 items added</strong>
                  <p>From grocery photo</p>
                </div>
                <time>2h</time>
              </div>
              <div className="activity-item">
                <span className="activity-icon cooked">
                  <Icon name="check" size={15} />
                </span>
                <div>
                  <strong>Tomato pasta cooked</strong>
                  <p>5 ingredients updated</p>
                </div>
                <time>Sun</time>
              </div>
              <div className="activity-item">
                <span className="activity-icon removed">
                  <Icon name="minus" size={15} />
                </span>
                <div>
                  <strong>Milk discarded</strong>
                  <p>Expired · 0.3 L</p>
                </div>
                <time>Sat</time>
              </div>
            </div>
            <Button
              variant="ghost"
              className="activity-link"
              onClick={() => onNavigate?.("Activity")}
            >
              View all activity <Icon name="arrow" size={16} />
            </Button>
            </>
          )}
        </aside>
      </section>
    </>
  );
}
