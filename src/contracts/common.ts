import { z } from "zod";

export const quantitySchema = z.number().min(0).max(999999.999)
  .refine((value) => Math.abs(value * 1000 - Math.round(value * 1000)) <= 1e-6
    && (value === 0 || Math.round(value * 1000) > 0), "Use at most three decimal places")
  .transform((value) => Math.round(value * 1000) / 1000);
export const positiveQuantitySchema = quantitySchema.refine((value) => value > 0);
export const quantityDeltaSchema = z.number().min(-999999.999).max(999999.999)
  .refine((value) => quantitySchema.safeParse(Math.abs(value)).success)
  .transform((value) => Math.round(value * 1000) / 1000);
export const unitSchema = z.enum([
  "item", "portion", "bag", "tub", "head", "can", "bunch", "cup",
  "tsp", "tbsp", "g", "kg", "mL", "L",
]);
export const storageLocationSchema = z.enum(["Fridge", "Freezer", "Pantry", "Counter"]);
export const calendarDateSchema = z.iso.date().refine((value) => !value.startsWith("0000-"));
export const timestampSchema = z.iso.datetime({ offset: true });
export type Quantity = z.infer<typeof quantitySchema>;
export type Unit = z.infer<typeof unitSchema>;
export type StorageLocation = z.infer<typeof storageLocationSchema>;
export type CalendarDate = z.infer<typeof calendarDateSchema>;
