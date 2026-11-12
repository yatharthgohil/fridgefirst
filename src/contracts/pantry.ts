import { z } from "zod";
import { calendarDateSchema, quantitySchema, storageLocationSchema, timestampSchema, unitSchema } from "./common";

export const expirationIntentSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("estimate") }),
  z.strictObject({ kind: z.literal("override"), date: calendarDateSchema }),
  z.strictObject({ kind: z.literal("unknown") }),
]);
export const expirationProvenanceSchema = z.strictObject({
  referenceId: z.uuid(), foodName: z.string().min(1), storageLocation: storageLocationSchema,
  days: z.number().int().positive().max(36500), sourceName: z.string().min(1),
  sourceUrl: z.url(), sourceAccessedOn: calendarDateSchema, assumptions: z.string().min(1),
});
export const expirationResultSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("estimate"), date: calendarDateSchema, provenance: expirationProvenanceSchema }),
  z.strictObject({ kind: z.literal("override"), date: calendarDateSchema }),
  z.strictObject({ kind: z.literal("unknown"), date: z.null(), reason: z.enum(["no_match", "user_cleared"]) }),
]);
export const pantryFieldsSchema = z.strictObject({
  name: z.string().trim().min(1).max(200), quantity: quantitySchema, unit: unitSchema,
  storageLocation: storageLocationSchema, addedOn: calendarDateSchema,
  expiration: expirationIntentSchema, notes: z.string().max(2000).nullable().optional(),
});
export const pantryCreateRequestSchema = pantryFieldsSchema;
export const pantryChangesSchema = pantryFieldsSchema.partial()
  .refine((changes) => Object.keys(changes).length > 0, "Supply at least one change")
  .refine((changes) => changes.unit === undefined || changes.quantity !== undefined,
    "A unit correction requires a replacement quantity");
export const versionSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const pantryUpdateRequestSchema = z.strictObject({ expectedVersion: versionSchema, changes: pantryChangesSchema });
export const pantryDeleteRequestSchema = z.strictObject({ expectedVersion: versionSchema });
export const persistedPantryItemSchema = z.strictObject({
  id: z.uuid(), name: pantryFieldsSchema.shape.name, quantity: quantitySchema, unit: unitSchema,
  storageLocation: storageLocationSchema, addedOn: calendarDateSchema,
  expiration: expirationResultSchema, notes: z.string().max(2000).nullable(),
  status: z.enum(["active", "consumed", "discarded"]), version: versionSchema,
  createdAt: timestampSchema, updatedAt: timestampSchema,
});
export const urgencySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("unknown"), daysRemaining: z.null(), label: z.string().min(1) }),
  z.strictObject({ kind: z.enum(["past_date", "critical", "soon", "later"]), daysRemaining: z.number().int(), label: z.string().min(1) }),
]);
export const pantryItemSchema = persistedPantryItemSchema.extend({ urgency: urgencySchema });
export const pantryListResponseSchema = z.strictObject({ items: z.array(pantryItemSchema), asOfDate: calendarDateSchema });
export const pantryItemResponseSchema = z.strictObject({ item: pantryItemSchema });
export type ExpirationIntent = z.infer<typeof expirationIntentSchema>;
export type ExpirationProvenance = z.infer<typeof expirationProvenanceSchema>;
export type ExpirationResult = z.infer<typeof expirationResultSchema>;
export type PantryCreateRequest = z.infer<typeof pantryCreateRequestSchema>;
export type PantryChanges = z.infer<typeof pantryChangesSchema>;
export type PantryUpdateRequest = z.infer<typeof pantryUpdateRequestSchema>;
export type PantryDeleteRequest = z.infer<typeof pantryDeleteRequestSchema>;
export type PersistedPantryItem = z.infer<typeof persistedPantryItemSchema>;
export type Urgency = z.infer<typeof urgencySchema>;
export type PantryItem = z.infer<typeof pantryItemSchema>;
export type PantryListResponse = z.infer<typeof pantryListResponseSchema>;
export type PantryItemResponse = z.infer<typeof pantryItemResponseSchema>;
