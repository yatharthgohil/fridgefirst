"use client";

import React, { useEffect, useId, useState } from "react";
import { Button, Icon, type IconName } from "@/components";
import type { InventoryHistoryEntry } from "@/contracts/inventory";
import type { InventoryApi } from "./inventory-api";
import {
  formatAbsoluteTime,
  formatDelta,
  formatRelativeTime,
  operationLabel,
  operationTone,
  toInventoryApiError,
  type ActivityTone,
} from "./inventory-core";
import "./inventory.css";

export interface RecentActivityPanelProps {
  /** Must be referentially stable (create it once with useState/useMemo). */
  api: InventoryApi;
  /** Change this value (e.g. increment a counter) to reload after a mutation. */
  refreshToken?: number;
  limit?: number;
  title?: string;
  onViewAll?: () => void;
}

const TONE_ICONS: Record<ActivityTone, IconName> = {
  added: "plus",
  adjusted: "settings",
  removed: "minus",
  cooked: "check",
};

/**
 * Isolated "recent inventory changes" panel. Loads its own data from the
 * history API and shows loading, empty, error/retry, and list states.
 */
export function RecentActivityPanel({
  api,
  refreshToken = 0,
  limit = 5,
  title = "Pantry activity",
  onViewAll,
}: RecentActivityPanelProps) {
  const headingId = useId();
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${limit}:${refreshToken}:${attempt}`;

  const [entries, setEntries] = useState<InventoryHistoryEntry[] | null>(null);
  const [settled, setSettled] = useState<{ key: string; error: string | null } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api.listHistory({ limit, signal: controller.signal }).then(
      (result) => {
        if (controller.signal.aborted) return;
        setEntries(result);
        setSettled({ key: requestKey, error: null });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setSettled({ key: requestKey, error: toInventoryApiError(error).message });
      },
    );
    return () => controller.abort();
  }, [api, limit, requestKey]);

  const loading = settled?.key !== requestKey;
  const error = loading ? null : settled?.error ?? null;
  const retry = () => setAttempt((value) => value + 1);
  const now = new Date();

  return (
    <section className="recent-activity" aria-labelledby={headingId} aria-busy={loading}>
      <div className="side-section-heading activity-title">
        <div>
          <span className="eyebrow">RECENT</span>
          <h2 id={headingId}>{title}</h2>
        </div>
        {loading && entries !== null && (
          <span className="recent-activity-refreshing" role="status">
            Updating…
          </span>
        )}
      </div>

      {entries === null && loading ? (
        <ul className="activity-list recent-activity-skeleton" aria-label="Loading recent activity">
          {Array.from({ length: Math.min(limit, 3) }, (_, index) => (
            <li className="activity-item" key={index}>
              <span className="activity-icon" />
              <div>
                <i />
                <i />
              </div>
            </li>
          ))}
        </ul>
      ) : entries === null && error ? (
        <div className="recent-activity-state" role="alert">
          <strong>Couldn&apos;t load recent activity</strong>
          <p>{error}</p>
          <Button variant="secondary" onClick={retry}>
            Try again
          </Button>
        </div>
      ) : entries && entries.length === 0 ? (
        <div className="recent-activity-state">
          <span>
            <Icon name="history" size={18} />
          </span>
          <strong>No pantry changes yet</strong>
          <p>Items you add, use, or discard will show up here.</p>
        </div>
      ) : (
        <>
          {error && (
            <div className="recent-activity-inline-error" role="alert">
              <span>Couldn&apos;t refresh. Showing earlier activity.</span>
              <Button variant="ghost" onClick={retry}>
                Retry
              </Button>
            </div>
          )}
          <ul className="activity-list" aria-label={`${title}, newest first`}>
            {entries?.map((entry) => (
              <ActivityRow key={entry.id} entry={entry} now={now} />
            ))}
          </ul>
        </>
      )}

      {onViewAll && (
        <Button variant="ghost" className="activity-link" onClick={onViewAll}>
          View all activity <Icon name="arrow" size={16} />
        </Button>
      )}
    </section>
  );
}

function ActivityRow({ entry, now }: { entry: InventoryHistoryEntry; now: Date }) {
  const tone = operationTone(entry.operation);
  const label = operationLabel(entry.operation);
  const delta = formatDelta(entry.quantityDelta, entry.unit);
  return (
    <li className="activity-item">
      <span className={`activity-icon ${tone}`} aria-hidden="true">
        <Icon name={TONE_ICONS[tone]} size={15} />
      </span>
      <div>
        <strong>{entry.itemName}</strong>
        <p>
          <span className={`recent-activity-op ${tone}`}>{label}</span>
          <span aria-hidden="true"> · </span>
          <span className="recent-activity-delta">{delta}</span>
        </p>
      </div>
      <time dateTime={entry.occurredAt} title={formatAbsoluteTime(entry.occurredAt)}>
        {formatRelativeTime(entry.occurredAt, now)}
      </time>
    </li>
  );
}
