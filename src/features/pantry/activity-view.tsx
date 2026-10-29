"use client";

import React, { useState, useMemo } from "react";
import { Button, Icon } from "@/components";
import { ActivityEvent } from "./types";

export interface ActivityViewProps {
  events: ActivityEvent[];
  savedAmount?: string;
}

export function ActivityView({ events, savedAmount = "3.2 kg" }: ActivityViewProps) {
  const [activityFilter, setActivityFilter] = useState("All");

  const filteredActivity = useMemo(() => {
    if (activityFilter === "All") return events;
    return events.filter(
      (event) => event.type.toLowerCase() === activityFilter.toLowerCase()
    );
  }, [events, activityFilter]);

  const days = ["Today", "Yesterday", "Saturday", "Friday", "Thursday", "Wednesday", "Tuesday"];

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
            <strong>11</strong>
            <span>Items added</span>
          </div>
        </article>
        <article>
          <span className="activity-summary-icon cooked">
            <Icon name="check" />
          </span>
          <div>
            <strong>3</strong>
            <span>Meals cooked</span>
          </div>
        </article>
        <article>
          <span className="activity-summary-icon adjusted">
            <Icon name="settings" />
          </span>
          <div>
            <strong>2</strong>
            <span>Items adjusted</span>
          </div>
        </article>
        <article>
          <span className="activity-summary-icon rescued">
            <Icon name="sparkle" />
          </span>
          <div>
            <strong>{savedAmount}</strong>
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
          {days.map((day) => {
            const dayEvents = filteredActivity.filter((event) => event.day === day);
            if (!dayEvents.length) return null;
            return (
              <section className="activity-day" key={day}>
                <div className="activity-day-label">
                  <strong>{day}</strong>
                  <span>{day === "Today" ? "May 19" : day === "Yesterday" ? "May 18" : day}</span>
                </div>
                <div className="activity-day-events">
                  {dayEvents.map((event) => (
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
          })}
        </div>
        <div className="inventory-footer">
          <span>Showing activity from May 13–19</span>
          <span>History is kept for your account</span>
        </div>
      </div>
    </section>
  );
}
