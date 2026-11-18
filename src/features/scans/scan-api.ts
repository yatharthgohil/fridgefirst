import { z } from "zod";
import {
  scanCreateRequestSchema,
  scanConfirmRequestSchema,
  scanConfirmResponseSchema,
  scanResponseSchema,
  scanIdSchema,
  SCAN_BUCKET,
  type Scan,
  type ScanCreateRequest,
  type ScanConfirmRequest,
  type ScanConfirmResponse,
} from "@/contracts/scans";

export interface ScanApi {
  create(request: ScanCreateRequest): Promise<Scan>;
  get(id: string): Promise<Scan>;
  analyze(id: string): Promise<Scan>;
  confirm(
    id: string,
    request: ScanConfirmRequest,
  ): Promise<ScanConfirmResponse>;
  delete(id: string): Promise<void>;
  upload(scan: Scan, files: File[]): Promise<void>;
}
const errorSchema = z.object({ error: z.object({ message: z.string() }) });
export function createHttpScanApi(options: {
  fetchImpl?: typeof fetch;
  uploadFile: (bucket: string, path: string, file: File) => Promise<void>;
}): ScanApi {
  const fetchImpl = options.fetchImpl ?? fetch;
  async function send(
    path: string,
    method: string,
    body?: unknown,
  ): Promise<unknown> {
    const response = await fetchImpl(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      ...(body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
    if (response.status === 204) return undefined;
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = errorSchema.safeParse(data);
      throw new Error(
        error.success
          ? error.data.error.message
          : "The scan request failed. Please try again.",
      );
    }
    return data;
  }
  const path = (id: string) => `/api/scans/${scanIdSchema.parse(id)}`;
  return {
    async create(request) {
      return scanResponseSchema.parse(
        await send(
          "/api/scans",
          "POST",
          scanCreateRequestSchema.parse(request),
        ),
      ).scan;
    },
    async get(id) {
      return scanResponseSchema.parse(await send(path(id), "GET")).scan;
    },
    async analyze(id) {
      return scanResponseSchema.parse(
        await send(`${path(id)}/analyze`, "POST", {}),
      ).scan;
    },
    async confirm(id, request) {
      return scanConfirmResponseSchema.parse(
        await send(
          `${path(id)}/confirm`,
          "POST",
          scanConfirmRequestSchema.parse(request),
        ),
      );
    },
    async delete(id) {
      await send(path(id), "DELETE", {});
    },
    async upload(scan, files) {
      if (scan.status !== "uploading" || files.length !== scan.images.length)
        throw new Error("Choose the images for this scan again.");
      for (const [index, image] of scan.images.entries()) {
        const file = files[index];
        if (
          !file ||
          file.size !== image.size ||
          file.type !== image.contentType
        )
          throw new Error("The selected images do not match this scan.");
        await options.uploadFile(SCAN_BUCKET, image.path, file);
      }
    },
  };
}
