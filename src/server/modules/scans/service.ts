import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  SCAN_BUCKET,
  MAX_SCAN_IMAGE_BYTES,
  scanSchema,
  scanResponseSchema,
  scanConfirmResponseSchema,
  visionOutputSchema,
  type ScanCreateRequest,
  type ScanConfirmRequest,
} from "@/contracts/scans";
import { ApiError, rpcResult } from "@/server/api/protocol";
import { inventoryErrorResponseSchema } from "@/contracts/inventory";
import { prepareScanImage } from "./images";
import { analyzeGroceryImages, assertScanProviderConfigured } from "./vision";

const claimSchema = z.strictObject({
  scan: scanSchema,
  token: z.uuid().nullable(),
});
const deletedSchema = z.strictObject({ deleted: z.literal(true) });

export async function createScan(request: ScanCreateRequest) {
  const client = await createClient();
  const { data, error } = await client.rpc("scan_create", {
    p_request: request,
  });
  if (error) throw new Error("Scan creation failed");
  return rpcResult(data, scanResponseSchema);
}

export async function getScan(scanId: string) {
  const client = await createClient();
  const { data, error } = await client.rpc("scan_get", { p_scan_id: scanId });
  if (error) throw new Error("Scan lookup failed");
  return rpcResult(data, scanResponseSchema);
}

export async function analyzeScan(scanId: string) {
  try {
    assertScanProviderConfigured();
  } catch {
    throw new ApiError(
      {
        error: {
          code: "server",
          message:
            "Photo recognition is not configured. Contact the app owner or add items manually.",
        },
      },
      503,
    );
  }
  const client = await createClient();
  const { data, error } = await client.rpc("scan_claim", { p_scan_id: scanId });
  if (error) throw new Error("Analysis claim failed");
  const { scan, token } = rpcResult(data, claimSchema);
  if (token === null) return { scan };
  let completion;
  try {
    const images: string[] = [];
    for (const entry of scan.images) {
      const download = await client.storage
        .from(SCAN_BUCKET)
        .download(entry.path, undefined, {
          signal: AbortSignal.timeout(15_000),
        });
      if (
        download.error ||
        !download.data ||
        download.data.size !== entry.size ||
        download.data.size > MAX_SCAN_IMAGE_BYTES
      )
        throw new Error("Image unavailable");
      const prepared = await prepareScanImage(
        new Uint8Array(await download.data.arrayBuffer()),
        entry.contentType,
      );
      images.push(prepared.dataUrl);
    }
    const output = visionOutputSchema.parse(
      await analyzeGroceryImages(images, scan.kind),
    );
    if (output.items.some((item) => item.imageIndex >= scan.images.length))
      throw new Error("Invalid image reference");
    completion = {
      p_proposals: output.items.map((item) => ({ ...item, id: randomUUID() })),
      p_message: null,
    };
  } catch {
    completion = {
      p_proposals: null,
      p_message:
        "We could not recognize this photo. Check the image and try again, or add items manually.",
    };
  }
  const finished = await client.rpc("scan_finish", {
    p_scan_id: scanId,
    p_token: token,
    ...completion,
  });
  if (finished.error) throw new Error("Analysis completion failed");
  return rpcResult(finished.data, scanResponseSchema);
}

export async function confirmScan(scanId: string, request: ScanConfirmRequest) {
  const client = await createClient();
  const { data, error } = await client.rpc("scan_confirm", {
    p_scan_id: scanId,
    p_request: request,
  });
  if (error) throw new Error("Scan confirmation failed");
  return rpcResult(data, scanConfirmResponseSchema);
}

export async function deleteScan(scanId: string) {
  const client = await createClient();
  const prepared = await client.rpc("scan_prepare_delete", {
    p_scan_id: scanId,
  });
  if (prepared.error) throw new Error("Scan deletion preparation failed");
  const failure = inventoryErrorResponseSchema.safeParse(prepared.data);
  if (failure.success && failure.data.error.code === "not_found") return;
  const { scan } = rpcResult(prepared.data, scanResponseSchema);
  const removed = await client.storage
    .from(SCAN_BUCKET)
    .remove(scan.images.map((image) => image.path));
  if (removed.error) throw new Error("Photo deletion failed. Retry deletion.");
  const deleted = await client.rpc("scan_delete", { p_scan_id: scanId });
  if (deleted.error) throw new Error("Scan deletion failed");
  rpcResult(deleted.data, deletedSchema);
}
