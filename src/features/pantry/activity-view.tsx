"use client";

import React, { useState, useMemo } from "react";
import { Button, Icon } from "@/components";
import { ActivityEvent } from "./types";

export interface ActivityViewProps {
  events: ActivityEvent[];
  savedAmount?: string;
}

export function ActivityView({ events, savedAmount }: ActivityViewProps) {
  const [activityFilter, setActivityFilter] = useState("All");

  const filteredActivity = useMemo(() => {
    if (activityFilter === "All") return events;
    return events.filter(
      (event) => event.type.toLowerCase() === activityFilter.toLowerCase()
    );
  }, [events, activityFilter]);

  const itemsAddedCount = useMemo(
    () => events.filter((e) => e.type === "added").length,
    [events]
  );
  const mealsCookedCount = useMemo(
    () => events.filter((e) => e.type === "cooked").length,
    [events]
  );
  const itemsAdjustedCount = useMemo(
    () => events.filter((e) => e.type === "adjusted" || e.type === "removed").length,
    [events]
  );
  const rescuedAmount = useMemo(() => {
    if (savedAmount) return savedAmount;
    return "0.0 kg";
  }, [savedAmount]);

  const dayGroups = useMemo(() => {
    const ordered: { label: string; dateLabel: string }[] = [];
    const now = new Date();
    const DAY_MS = 24 * 60 * 60 * 1000;

    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getTime() - i * DAY_MS);
      const label = i === 0 ? "Today" : i === 1 ? "Yesterday" : d.toLocaleDateString("en-US", { weekday: "long" });
      const dateLabel = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      ordered.push({ label, dateLabel });
    }

    const known = new Set(ordered.map((d) => d.label));
    for (const event of filteredActivity) {
      if (!known.has(event.day)) {
        ordered.push({ label: event.day, dateLabel: event.day });
        known.add(event.day);
      }
    }

    return ordered;
  }, [filteredActivity]);

  const rangeLabel = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    const startMonth = weekAgo.toLocaleDateString("en-US", { month: "short" });
    const endMonth = now.toLocaleDateString("en-US", { month: "short" });
    if (startMonth === endMonth) {
      return `Showing activity from ${startMonth} ${weekAgo.getDate()}–${now.getDate()}`;
    }
    return `Showing activity from ${startMonth} ${weekAgo.getDate()} – ${endMonth} ${now.getDate()}`;
  }, []);

  return (
    <section className="all-activity">
      <div className="activity-page-header">
        <div>
          <span className="eyebrow">LAST 7 DAYS</span>
          <h1>Pantry activity</h1>
          <p>A complete record of what was added, cooked, adjusted, consumed, or discarded.</p>
        </div>
      </div>

      <div className="pantry-summary-grid activity-summary-grid">
        <article>
          <span className="activity-summary-icon added">
            <Icon name="plus" />
          </span>
          <div>
            <strong>{itemsAddedCount}</strong>
            <span>Items added</span>
          </div>
        </article>
        <article>
          <span className="activity-summary-icon cooked">
            <Icon name="check" />
          </span>
          <div>
            <strong>{mealsCookedCount}</strong>
            <span>Meals cooked</span>
          </div>
        </article>
        <article>
          <span className="activity-summary-icon adjusted">
            <Icon name="settings" />
          </span>
          <div>
            <strong>{itemsAdjustedCount}</strong>
            <span>Items adjusted</span>
          </div>
        </article>
        <article>
          <span className="activity-summary-icon rescued">
            <Icon name="sparkle" />
          </span>
          <div>
            <strong>{rescuedAmount}</strong>
            <span>Food rescued</span>
          </div>
        </article>
      </div>

      <div className="activity-history-panel">
        <div className="activity-toolbar">
          <div className="inventory-tabs">
            {["All", "Added", "Cooked", "Adjusted", "Removed"].map((name) => (
              <Button
                key={name}
                variant="ghost"
                className={activityFilter === name ? "selected" : ""}
                onClick={() => setActivityFilter(name)}
              >
                {name}
              </Button>
            ))}
          </div>
          <span>{filteredActivity.length} events</span>
        </div>

        <div className="activity-history">
          {filteredActivity.length === 0 ? (
            <div className="activity-empty-state" style={{ padding: "48px 24px", textAlign: "center", background: "var(--white)", borderRadius: "12px", margin: "16px 0", border: "1px dashed var(--line)" }}>
              <div style={{ display: "grid", placeItems: "center", width: "48px", height: "48px", margin: "0 auto 12px", borderRadius: "50%", background: "var(--green-pale)", color: "var(--green)" }}>
                <Icon name="history" size={24} />
              </div>
              <strong style={{ display: "block", fontSize: "14px", color: "var(--ink)", marginBottom: "4px" }}>No activity recorded yet</strong>
              <p style={{ margin: 0, fontSize: "12px", color: "var(--muted)" }}>
                As you add items, cook meals, or make adjustments, your recent pantry activity will appear here.
              </p>
            </div>
          ) : (
            dayGroups.map(({ label: day, dateLabel }) => {
              const dayEvents = filteredActivity.filter((event) => event.day === day);
              if (!dayEvents.length) return null;
              const sortedDayEvents = [...dayEvents].sort((a, b) => {
                const timeA =
                  typeof a.timestamp === "number" && !Number.isNaN(a.timestamp)
                    ? a.timestamp
                    : typeof a.id === "number"
                    ? a.id
                    : Date.parse(String(a.id)) || 0;
                const timeB =
                  typeof b.timestamp === "number" && !Number.isNaN(b.timestamp)
                    ? b.timestamp
                    : typeof b.id === "number"
                    ? b.id
                    : Date.parse(String(b.id)) || 0;
                return timeB - timeA;
              });
              return (
                <section className="activity-day" key={day}>
                  <div className="activity-day-label">
                    <strong>{day}</strong>
                    <span>{dateLabel}</span>
                  </div>
                  <div className="activity-day-events">
                    {sortedDayEvents.map((event) => (
                      <article className="history-event" key={event.id}>
                        <span className={`history-event-icon ${event.type}`}>
                          <Icon
                            name={
                              event.type === "added"
                                ? "plus"
                                : event.type === "cooked"
                                ? "check"
                                : event.type === "removed"
                                ? "minus"
                                : "settings"
                            }
                            size={16}
                          />
                        </span>
                        <div className="history-event-copy">
                          <div>
                            <strong>{event.title}</strong>
                            <span className={`event-type ${event.type}`}>{event.type}</span>
                          </div>
                          <p>{event.detail}</p>
                          <small>{event.meta}</small>
                        </div>
                        <div className="history-event-meta">
                          <strong>{event.quantity}</strong>
                          <time>{event.time}</time>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              );
            })
          )}
        </div>
        <div className="inventory-footer">
          <span>{rangeLabel}</span>
          <span>History is kept for your account</span>
        </div>
      </div>
    </section>
  );
}
