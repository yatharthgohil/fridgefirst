import { z } from "zod";

export const rescuedTotalsSchema = z.object({
  monthlyKg: z.number().finite().nonnegative(),
  lifetimeKg: z.number().finite().nonnegative(),
});
export type RescuedTotals = z.infer<typeof rescuedTotalsSchema>;

export const rescuedMonthSchema = z.object({
  start: z.iso.datetime({ offset: true }),
  end: z.iso.datetime({ offset: true }),
}).refine(({ start, end }) => {
  const duration = Date.parse(end) - Date.parse(start);
  return duration >= 27 * 86400000 && duration <= 32 * 86400000;
});
