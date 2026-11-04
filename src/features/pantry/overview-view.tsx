"use client";

import React, { useState, useMemo } from "react";
import { Button, Icon, FoodArt, ExpiryBadge, QuantityMeter } from "@/components";
import { PantryItem, formatUnit } from "./types";

export interface OverviewViewProps {
  userName?: string;
  items: PantryItem[];
  onOpenRecipe?: (recipeId: number, startCooking?: boolean) => void;
  onNavigate?: (pageName: string) => void;
  onEditItem?: (item: PantryItem) => void;
  onNotice?: (msg: string) => void;
}

export function OverviewView({
  userName = "Alex",
  items,
  onOpenRecipe,
  onNavigate,
  onEditItem,
  onNotice,
}: OverviewViewProps) {
  const [filter, setFilter] = useState("All");

  const overviewPantryItems = useMemo(() => {
    return items.filter((item) => {
      if (filter === "All") return true;
      if (filter === "Expiring") return item.urgency !== "fresh";
      if (filter === "Pantry") return item.location === "Pantry";
      return true;
    });
  }, [items, filter]);

  return (
    <>
      <section className="welcome-row">
        <div>
          <div className="date-label">MONDAY, MAY 19</div>
          <h1>Good afternoon, {userName}.</h1>
          <p>Here’s what to use next, before it goes to waste.</p>
        </div>
        <Button
          variant="ghost"
          className="quick-stat"
          onClick={() => {
            setFilter("Expiring");
            onNotice?.("Viewing items needing attention");
          }}
          aria-label="View pantry items that need attention"
        >
          <span className="stat-icon">
            <Icon name="sparkle" />
          </span>
          <div>
            <strong>3 items</strong>
            <span>need your attention</span>
          </div>
          <Icon name="arrow" size={18} />
        </Button>
      </section>

      <section className="dashboard-grid">
        <div className="left-column">
          <div className="section-heading">
            <div>
              <span className="eyebrow">COOK NEXT</span>
              <h2>Tonight’s best match</h2>
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
              <span className="match-pill">
                <Icon name="sparkle" size={14} /> 96% pantry match
              </span>
            </div>
            <div className="recipe-content">
              <div className="recipe-kicker">
                USE THESE FIRST <span>Spinach</span>
                <span>Greek yogurt</span>
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
            {overviewPantryItems.slice(0, 4).map((item) => (
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
                <ExpiryBadge urgency={item.urgency} expiry={item.expiry} />
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
            {overviewPantryItems.length === 0 && (
              <div className="empty-state">No pantry items match your search.</div>
            )}
          </div>
          <Button
            variant="secondary"
            className="view-pantry"
            onClick={() => onNavigate?.("My pantry")}
          >
            View all {items.length} pantry items <Icon name="arrow" size={17} />
          </Button>
        </div>

        <aside className="right-column">
          <div className="side-section-heading">
            <div>
              <span className="eyebrow">UP NEXT</span>
              <h2>Needs attention</h2>
            </div>
            <span className="count-badge">3</span>
          </div>
          <div className="attention-card critical-card">
            <div className="attention-top">
              <div className="food-thumb leaf">
                <FoodArt icon="leaf" />
              </div>
              <div>
                <span className="alert-label">USE TODAY</span>
                <strong>Baby spinach</strong>
                <small>Added 6 days ago</small>
              </div>
            </div>
            <p>Best used in tonight’s recipe — we’ve already added it.</p>
            <div className="attention-actions">
              <Button onClick={() => onNotice?.("Spinach marked as used")}>
                Mark used
              </Button>
              {onEditItem && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    const spinach = items.find((i) => i.id === 1);
                    if (spinach) onEditItem(spinach);
                  }}
                >
                  Edit
                </Button>
              )}
            </div>
          </div>
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
        </aside>
      </section>
    </>
  );
}
