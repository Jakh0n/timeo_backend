import type { AvailabilityWindow, SolverShift, SolverWorker, Weekday } from "./types.ts";

export const SHIFT_DURATION = 12;
export const MIN_REST_HOURS = 0;

const DAY_INDEX: Record<Weekday, number> = {
  MON: 0,
  TUE: 1,
  WED: 2,
  THU: 3,
  FRI: 4,
  SAT: 5,
  SUN: 6,
};

export function toAbsHour(day: Weekday, hour: number): number {
  return DAY_INDEX[day] * 24 + hour;
}

export function availAbsRange(windows: AvailabilityWindow[]): [number, number][] {
  return windows.map(({ day, startHour, endHour }) => {
    const start = toAbsHour(day, startHour);
    let duration = (endHour - startHour + 24) % 24;
    if (duration === 0) {
      duration = 24;
    }

    return [start, start + duration];
  });
}

export function isAvailable(
  worker: SolverWorker,
  shift: SolverShift,
  workerAvail: [number, number][],
): boolean {
  if (worker.branchId !== shift.branchId) {
    return false;
  }

  const shiftStart = toAbsHour(shift.day, shift.startHour);
  const shiftEnd = shiftStart + SHIFT_DURATION;

  return workerAvail.some(([start, end]) => start <= shiftStart && shiftEnd <= end);
}

export function restGap(left: SolverShift, right: SolverShift): number {
  const leftStart = toAbsHour(left.day, left.startHour);
  const leftEnd = leftStart + SHIFT_DURATION;
  const rightStart = toAbsHour(right.day, right.startHour);
  const rightEnd = rightStart + SHIFT_DURATION;

  return leftStart <= rightStart ? rightStart - leftEnd : leftStart - rightEnd;
}
