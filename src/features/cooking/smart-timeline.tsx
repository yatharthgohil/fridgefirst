"use client";

import React from "react";
import { Icon } from "@/components";
import { TimelineStep } from "./types";

export interface SmartTimelineProps {
  timeline: TimelineStep[];
  cookingStarted?: boolean;
  timeSavedMinutes?: number;
}

export function SmartTimeline({
  timeline,
  cookingStarted = false,
  timeSavedMinutes = 9,
}: SmartTimelineProps) {
  return (
    <section className="smart-plan-section">
      <div className="plan-heading">
        <div>
          <span className="eyebrow">SMART COOKING PLAN</span>
          <h3>Finish sooner, without rushing</h3>
        </div>
        <span className="time-saved">
          <Icon name="clock" size={15} /> Saves about {timeSavedMinutes} min
        </span>
      </div>
      <p className="plan-intro">
        Independent steps overlap safely. Cleanup only appears when nothing needs your
        immediate attention.
      </p>
      <div className="smart-timeline">
        {timeline.map((step, index) => (
          <article
            className={`timeline-step ${step.type} ${
              cookingStarted && index === 0 ? "current" : ""
            }`}
            key={`${step.time}-${step.title}`}
          >
            <div className="timeline-time">
              <strong>{step.time}</strong>
              <span>{step.duration}</span>
            </div>
            <span className="timeline-node">
              {step.type === "cleanup" ? (
                <Icon name="sparkle" size={14} />
              ) : (
                index + 1
              )}
            </span>
            <div className="timeline-copy">
              <div>
                <strong>{step.title}</strong>
                {step.type === "parallel" && (
                  <span className="step-tag parallel-tag">OVERLAPS</span>
                )}
                {step.type === "cleanup" && (
                  <span className="step-tag cleanup-tag">CLEAN AS YOU GO</span>
                )}
              </div>
              <p>{step.detail}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="safety-note">
        <Icon name="check" size={16} />
        <p>
          <strong>Safety built in.</strong> The plan never schedules cleanup while a
          pan needs stirring, a knife is in use, or a timed step is due.
        </p>
      </div>
    </section>
  );
}
