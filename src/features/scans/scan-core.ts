import {
  scanCreateRequestSchema,
  scanConfirmRequestSchema,
  type Scan,
  type ScanProposal,
  type ScanKind,
} from "@/contracts/scans";
import { pantryCreateRequestSchema } from "@/contracts/pantry";

export type ScanReviewDraft = {
  proposal: ScanProposal;
  selected: boolean;
  name: string;
  quantity: string;
  unit: string;
  storageLocation: string;
  addedOn: string;
  expirationMode: "estimate" | "unknown" | "override";
  expirationDate: string;
};
export function createScanDrafts(
  proposals: ScanProposal[],
  addedOn: string,
): ScanReviewDraft[] {
  return proposals.map((proposal) => ({
    proposal,
    selected: true,
    name: proposal.name,
    quantity: proposal.quantity === null ? "" : String(proposal.quantity),
    unit: proposal.unit ?? "",
    storageLocation: proposal.storageLocation,
    addedOn,
    expirationMode: "estimate",
    expirationDate: "",
  }));
}
export function validateScanFiles(
  files: File[],
  kind: ScanKind = "grocery_photo",
) {
  if (
    files.some(
      (file) => /\.hei[cf]$/i.test(file.name) || /hei[cf]/i.test(file.type),
    )
  )
    throw new Error(
      "HEIC photos are not supported. Export them as JPEG before uploading.",
    );
  const parsed = scanCreateRequestSchema.safeParse({
    kind,
    images: files.map((file) => ({ contentType: file.type, size: file.size })),
  });
  if (!parsed.success)
    throw new Error(
      "Choose one JPEG, PNG, or WebP image no larger than 5 MiB.",
    );
  return parsed.data;
}
export function buildScanConfirmation(
  scan: Extract<Scan, { status: "review" }>,
  drafts: ScanReviewDraft[],
) {
  const items = drafts
    .filter((draft) => draft.selected)
    .map((draft) => {
      if (!draft.quantity.trim() || !(Number(draft.quantity) > 0))
        throw new Error(
          `Enter a positive quantity for ${draft.name || "each selected item"}.`,
        );
      const fields = pantryCreateRequestSchema.safeParse({
        name: draft.name,
        quantity: Number(draft.quantity),
        unit: draft.unit,
        storageLocation: draft.storageLocation,
        addedOn: draft.addedOn,
        expiration:
          draft.expirationMode === "override"
            ? { kind: "override", date: draft.expirationDate }
            : { kind: draft.expirationMode },
      });
      if (!fields.success)
        throw new Error(
          `Check the name, quantity, unit, storage, and dates for ${draft.name || "each selected item"}.`,
        );
      return { proposalId: draft.proposal.id, fields: fields.data };
    });
  const parsed = scanConfirmRequestSchema.safeParse({
    expectedVersion: scan.version,
    items,
  });
  if (!parsed.success) throw new Error("Select at least one grocery to add.");
  return parsed.data;
}
export function scanRecoveryKey(ownerId: string) {
  return `ff_pending_scan_${ownerId}`;
}
