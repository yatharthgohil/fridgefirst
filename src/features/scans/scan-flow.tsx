"use client";

import React, { useEffect, useRef, useState } from "react";
import "./scan-flow.css";
import { Modal, Button } from "@/components";
import { unitSchema, storageLocationSchema } from "@/contracts/common";
import { scanIdSchema, type Scan } from "@/contracts/scans";
import { createClient } from "@/lib/supabase/client";
import { createHttpScanApi, type ScanApi } from "./scan-api";
import {
  buildScanConfirmation,
  createScanDrafts,
  scanRecoveryKey,
  validateScanFiles,
  type ScanReviewDraft,
} from "./scan-core";

function localCalendarDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

type FlowState =
  | { phase: "idle" }
  | { phase: "busy"; message: string; scan: Scan | null }
  | { phase: "session"; scan: Scan }
  | { phase: "done"; scanId: string; count: number };
export function ScanFlow({
  ownerId,
  onClose,
  onConfirmed,
  api: injectedApi,
}: {
  ownerId: string | undefined;
  onClose: () => void;
  onConfirmed: () => void;
  api?: ScanApi;
}) {
  const [api] = useState(
    () =>
      injectedApi ??
      createHttpScanApi({
        uploadFile: async (bucket, path, file) => {
          const { error } = await createClient()
            .storage.from(bucket)
            .upload(path, file, { contentType: file.type, upsert: false });
          if (error) throw new Error(error.message);
        },
      }),
  );
  const [state, setState] = useState<FlowState>({ phase: "idle" });
  const [drafts, setDrafts] = useState<ScanReviewDraft[]>([]);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(() => {
    if (!ownerId || typeof window === "undefined") return null;
    try {
      return (
        scanIdSchema.safeParse(localStorage.getItem(scanRecoveryKey(ownerId)))
          .data ?? null
      );
    } catch {
      return null;
    }
  });
  const running = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const remember = (id: string | null) => {
    setPendingId(id);
    if (!ownerId) return;
    try {
      if (id) localStorage.setItem(scanRecoveryKey(ownerId), id);
      else localStorage.removeItem(scanRecoveryKey(ownerId));
    } catch {
      return;
    }
  };
  const showScan = (scan: Scan) => {
    if (scan.status === "review")
      setDrafts(createScanDrafts(scan.proposals, localCalendarDate()));
    if (scan.status === "confirmed") {
      remember(scan.id);
      setState({ phase: "done", scanId: scan.id, count: scan.itemIds.length });
      onConfirmed();
    } else setState({ phase: "session", scan });
  };
  async function run(
    message: string,
    scan: Scan | null,
    task: () => Promise<void>,
  ) {
    if (running.current) return;
    running.current = true;
    setError("");
    setState({ phase: "busy", message, scan });
    try {
      await task();
    } catch (cause) {
      if (active.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : "The scan failed. Please try again.",
        );
        setState(scan ? { phase: "session", scan } : { phase: "idle" });
      }
    } finally {
      running.current = false;
    }
  }
  const chooseFiles = (files: File[]) => {
    if (!ownerId) {
      setError("Sign in to upload grocery photos.");
      return;
    }
    let request;
    try {
      request = validateScanFiles(files);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Check your images.");
      return;
    }
    void run("Uploading private photos...", null, async () => {
      const scan = await api.create(request);
      if (!active.current) return;
      remember(scan.id);
      try {
        await api.upload(scan, files);
      } catch (cause) {
        if (active.current) {
          setState({ phase: "session", scan });
          setError(
            `${cause instanceof Error ? cause.message : "Upload failed."} Discard this scan before selecting the photos again.`,
          );
        }
        return;
      }
      if (!active.current) return;
      setState({ phase: "busy", message: "Recognizing groceries...", scan });
      try {
        const analyzed = await api.analyze(scan.id);
        if (active.current) showScan(analyzed);
      } catch (cause) {
        if (active.current) {
          setState({ phase: "session", scan });
          setError(
            cause instanceof Error
              ? cause.message
              : "Recognition failed. Resume the scan to check its status.",
          );
        }
      }
    });
  };
  const currentScan = state.phase === "session" ? state.scan : null;
  const busy = state.phase === "busy";
  const close = () => {
    if (!running.current) onClose();
  };
  const discard = () => {
    const id =
      state.phase === "done" ? state.scanId : (currentScan?.id ?? pendingId);
    if (!id) {
      close();
      return;
    }
    void run("Deleting scan photos...", currentScan, async () => {
      await api.delete(id);
      if (active.current) {
        remember(null);
        setDrafts([]);
        setState({ phase: "idle" });
      }
    });
  };
  const resume = (id: string) =>
    void run("Loading saved scan...", currentScan, async () => {
      const scan = await api.get(id);
      if (active.current) showScan(scan);
    });
  const confirm = () => {
    if (currentScan?.status !== "review") return;
    let request;
    try {
      request = buildScanConfirmation(currentScan, drafts);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Check your groceries.",
      );
      return;
    }
    void run("Adding confirmed groceries...", currentScan, async () => {
      const result = await api.confirm(currentScan.id, request);
      if (active.current) {
        remember(currentScan.id);
        setState({
          phase: "done",
          scanId: currentScan.id,
          count: result.items.length,
        });
        onConfirmed();
      }
    });
  };
  const updateDraft = (id: string, change: Partial<ScanReviewDraft>) =>
    setDrafts((current) =>
      current.map((draft) =>
        draft.proposal.id === id ? { ...draft, ...change } : draft,
      ),
    );
  return (
    <Modal
      isOpen
      onClose={close}
      titleId="scan-title"
      className={
        currentScan?.status === "review" ? "review-modal" : "upload-modal"
      }
    >
      <h2 id="scan-title">
        {state.phase === "done"
          ? "Groceries added"
          : currentScan?.status === "review"
            ? "Check your groceries"
            : "Add groceries from photos"}
      </h2>
      {error && <p role="alert">{error}</p>}
      {busy && (
        <p role="status" aria-live="polite">
          {state.message}
        </p>
      )}
      {state.phase === "idle" && (
        <>
          <p>
            Photos stay private. Review and correct suggestions before anything
            is added to your pantry.
          </p>
          {pendingId ? (
            <>
              <p>A saved scan is available.</p>
              <Button onClick={() => resume(pendingId)}>Resume scan</Button>
              <Button variant="secondary" onClick={discard}>
                Discard scan and delete photos
              </Button>
            </>
          ) : (
            <label className="drop-zone">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={!ownerId}
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = "";
                  if (files.length) chooseFiles(files);
                }}
              />
              <strong>Choose a grocery photo</strong>
              <span>
                One JPEG, PNG, or WebP image, up to 5 MiB. Export HEIC as JPEG
                first.
              </span>
            </label>
          )}
          {!ownerId && <p>Sign in to use photo recognition.</p>}
        </>
      )}
      {currentScan?.status === "review" && (
        <>
          <p>
            Quantities and confidence are suggestions. Expiration estimates are
            calculated after saving and are not verified food safety dates.
          </p>
          {drafts.length === 0 && (
            <p>
              No groceries were identified. Discard this scan and try a clearer
              photo.
            </p>
          )}
          <div className="detected-list">
            {drafts.map((draft) => (
              <fieldset key={draft.proposal.id} className="scan-review-fields">
                <legend>
                  <label>
                    <input
                      type="checkbox"
                      checked={draft.selected}
                      onChange={(event) =>
                        updateDraft(draft.proposal.id, {
                          selected: event.target.checked,
                        })
                      }
                    />{" "}
                    Add {draft.name}
                  </label>
                </legend>
                <p>
                  {draft.proposal.confidence} confidence. Photo{" "}
                  {draft.proposal.imageIndex + 1}.
                </p>
                {draft.proposal.warnings.map((warning, index) => (
                  <p key={index}>{warning}</p>
                ))}
                <label>
                  Name
                  <input
                    className="detail-input"
                    aria-label={`Name for ${draft.proposal.name}`}
                    value={draft.name}
                    onChange={(event) =>
                      updateDraft(draft.proposal.id, {
                        name: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Quantity
                  <input
                    className="detail-input"
                    inputMode="decimal"
                    aria-label={`Quantity for ${draft.proposal.name}`}
                    value={draft.quantity}
                    onChange={(event) =>
                      updateDraft(draft.proposal.id, {
                        quantity: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Unit
                  <select
                    className="detail-input"
                    aria-label={`Unit for ${draft.proposal.name}`}
                    value={draft.unit}
                    onChange={(event) =>
                      updateDraft(draft.proposal.id, {
                        unit: event.target.value,
                      })
                    }
                  >
                    <option value="">Choose a unit</option>
                    {unitSchema.options.map((unit) => (
                      <option key={unit}>{unit}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Storage
                  <select
                    className="detail-input"
                    aria-label={`Storage for ${draft.proposal.name}`}
                    value={draft.storageLocation}
                    onChange={(event) =>
                      updateDraft(draft.proposal.id, {
                        storageLocation: event.target.value,
                      })
                    }
                  >
                    {storageLocationSchema.options.map((location) => (
                      <option key={location}>{location}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Added on
                  <input
                    className="detail-input"
                    type="date"
                    value={draft.addedOn}
                    onChange={(event) =>
                      updateDraft(draft.proposal.id, {
                        addedOn: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Expiration
                  <select
                    className="detail-input"
                    value={draft.expirationMode}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (
                        value === "estimate" ||
                        value === "unknown" ||
                        value === "override"
                      )
                        updateDraft(draft.proposal.id, {
                          expirationMode: value,
                        });
                    }}
                  >
                    <option value="estimate">
                      Estimate from food and storage
                    </option>
                    <option value="unknown">Unknown</option>
                    <option value="override">Enter a date myself</option>
                  </select>
                </label>
                {draft.expirationMode === "override" && (
                  <label>
                    Expiration date
                    <input
                      className="detail-input"
                      type="date"
                      value={draft.expirationDate}
                      onChange={(event) =>
                        updateDraft(draft.proposal.id, {
                          expirationDate: event.target.value,
                        })
                      }
                    />
                  </label>
                )}
              </fieldset>
            ))}
          </div>
          <Button
            disabled={!drafts.some((draft) => draft.selected)}
            onClick={confirm}
          >
            Confirm selected groceries
          </Button>
        </>
      )}
      {currentScan && currentScan.status !== "review" && (
        <>
          <p>
            {currentScan.status === "failed"
              ? currentScan.message
              : currentScan.status === "analyzing"
                ? "Recognition is in progress. Refresh its status, or retry after two minutes if it was interrupted."
                : "Your photo is waiting for recognition. If the upload failed, discard this scan and upload again."}
          </p>
          <Button onClick={() => resume(currentScan.id)}>
            Refresh scan status
          </Button>
          <Button
            onClick={() =>
              void run("Recognizing groceries...", currentScan, async () => {
                const scan = await api.analyze(currentScan.id);
                if (active.current) showScan(scan);
              })
            }
          >
            {currentScan.status === "uploading"
              ? "Analyze uploaded photo"
              : "Retry recognition"}
          </Button>
        </>
      )}
      {state.phase === "done" && (
        <>
          <p>
            {state.count} groceries saved to your pantry. You can delete the
            source photos now.
          </p>
          <Button variant="secondary" onClick={discard}>
            Delete source photos
          </Button>
        </>
      )}
      <div className="review-modal-footer">
        {currentScan && (
          <Button variant="secondary" onClick={discard}>
            Discard scan and delete photos
          </Button>
        )}
        <Button variant="ghost" disabled={busy} onClick={close}>
          {currentScan?.status === "review"
            ? "Close without saving edits"
            : "Close"}
        </Button>
      </div>
    </Modal>
  );
}
