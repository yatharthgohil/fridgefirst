import { z } from "zod";
import { storageLocationSchema, timestampSchema, unitSchema } from "./common";
import {
  pantryCreateRequestSchema,
  persistedPantryItemSchema,
  versionSchema,
} from "./pantry";

export const SCAN_BUCKET = "grocery-scans";
export const MAX_SCAN_IMAGES = 1;
export const MAX_SCAN_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_SCAN_ITEMS = 50;
export const scanKindSchema = z.literal("grocery_photo");
export const scanImageTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
export const scanImageInputSchema = z.strictObject({
  contentType: scanImageTypeSchema,
  size: z.number().int().positive().max(MAX_SCAN_IMAGE_BYTES),
});
export const scanCreateRequestSchema = z.strictObject({
  kind: scanKindSchema,
  images: z.array(scanImageInputSchema).min(1).max(MAX_SCAN_IMAGES),
});
export const scanImageSchema = scanImageInputSchema.extend({
  path: z.string().min(1).max(250),
});
export const visionItemSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  quantity: z.number().positive().max(999999.999).multipleOf(0.001).nullable(),
  unit: unitSchema.nullable(),
  storageLocation: storageLocationSchema,
  confidence: z.enum(["low", "medium", "high"]),
  imageIndex: z
    .number()
    .int()
    .min(0)
    .max(MAX_SCAN_IMAGES - 1),
  warnings: z.array(z.string().max(200)).max(5),
});
export const visionOutputSchema = z.strictObject({
  items: z.array(visionItemSchema).max(MAX_SCAN_ITEMS),
});
export const scanProposalSchema = visionItemSchema.extend({ id: z.uuid() });
const scanBaseSchema = z.strictObject({
  id: z.uuid(),
  kind: scanKindSchema,
  images: z.array(scanImageSchema).min(1).max(MAX_SCAN_IMAGES),
  version: versionSchema,
  createdAt: timestampSchema,
});
export const scanSchema = z.discriminatedUnion("status", [
  scanBaseSchema.extend({ status: z.literal("uploading") }),
  scanBaseSchema.extend({ status: z.literal("analyzing") }),
  scanBaseSchema.extend({
    status: z.literal("review"),
    proposals: z.array(scanProposalSchema).max(MAX_SCAN_ITEMS),
  }),
  scanBaseSchema.extend({
    status: z.literal("failed"),
    message: z.string().max(300),
  }),
  scanBaseSchema.extend({
    status: z.literal("confirmed"),
    itemIds: z.array(z.uuid()).max(MAX_SCAN_ITEMS),
  }),
]);
export const scanResponseSchema = z.strictObject({ scan: scanSchema });
export const scanConfirmRequestSchema = z.strictObject({
  expectedVersion: versionSchema,
  items: z
    .array(
      z.strictObject({
        proposalId: z.uuid(),
        fields: pantryCreateRequestSchema,
      }),
    )
    .min(1)
    .max(MAX_SCAN_ITEMS)
    .refine(
      (items) =>
        new Set(items.map((item) => item.proposalId)).size === items.length,
      "Select each suggestion once",
    ),
});
export const scanConfirmResponseSchema = z.strictObject({
  items: z.array(persistedPantryItemSchema).min(1).max(MAX_SCAN_ITEMS),
});
export const scanIdSchema = z.uuid();

export type ScanKind = z.infer<typeof scanKindSchema>;
export type Scan = z.infer<typeof scanSchema>;
export type ScanProposal = z.infer<typeof scanProposalSchema>;
export type ScanCreateRequest = z.infer<typeof scanCreateRequestSchema>;
export type ScanConfirmRequest = z.infer<typeof scanConfirmRequestSchema>;
export type ScanConfirmResponse = z.infer<typeof scanConfirmResponseSchema>;
export type VisionOutput = z.infer<typeof visionOutputSchema>;
