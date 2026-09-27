import type { ShiftType } from "../generated/prisma/client.ts";

// Day and night are 12-hour shifts. Night ends the next morning.
export const SHIFT_WINDOWS: Record<
  ShiftType,
  { startHour: number; endHour: number }
> = {
  DAY: { startHour: 9, endHour: 21 },
  NIGHT: { startHour: 21, endHour: 9 },
};
