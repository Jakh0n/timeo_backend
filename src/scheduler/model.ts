import { loadHighs } from "./highs.ts";
import { availAbsRange, isAvailable, MIN_REST_HOURS, restGap } from "./availability.ts";
import type { SolverShift, SolverWorker } from "./types.ts";

const UNFILLED_PENALTY = 1000;

type Pair = {
  workerId: string;
  shiftId: string;
  name: string;
};

export type ModelAssignment = {
  shiftId: string;
  workerId: string;
};

export type ModelResult = {
  status: "ok" | "infeasible";
  assignments: ModelAssignment[];
};

function sumTerm(names: string[]): string {
  if (names.length === 0) {
    return "0";
  }

  return names.map((name) => `+ ${name}`).join(" ");
}

function primalValue(column: unknown): number {
  if (
    typeof column === "object" &&
    column !== null &&
    "Primal" in column &&
    typeof column.Primal === "number"
  ) {
    return column.Primal;
  }

  return 0;
}

function buildModel(
  workers: SolverWorker[],
  shifts: SolverShift[],
  pairs: Pair[],
  pairsByShift: Map<string, Pair[]>,
  pairsByWorker: Map<string, Pair[]>,
  relaxCoverage: boolean,
): string {
  const workerById = new Map(workers.map((worker) => [worker.id, worker]));
  const shiftById = new Map(shifts.map((shift) => [shift.id, shift]));
  const lines: string[] = ["Minimize"];
  const shortNames = relaxCoverage ? shifts.map((shift) => `short_${shift.id}`) : [];
  const shortObjective = shortNames.map((name) => `+ ${UNFILLED_PENALTY} ${name}`).join(" ");

  lines.push(
    shortObjective.length > 0
      ? ` obj: ${shortObjective} + max_shifts - min_shifts`
      : " obj: max_shifts - min_shifts",
  );
  lines.push("Subject To");

  let constraintIndex = 0;

  for (const shift of shifts) {
    const here = pairsByShift.get(shift.id) ?? [];
    const allTerm = sumTerm(here.map((pair) => pair.name));
    const shortName = `short_${shift.id}`;

    if (relaxCoverage) {
      lines.push(
        ` c${constraintIndex++}: ${allTerm} + ${shortName} >= ${shift.requiredTotal}`,
      );
    } else {
      lines.push(` c${constraintIndex++}: ${allTerm} >= ${shift.requiredTotal}`);
    }

    const seniorHere = here.filter((pair) => workerById.get(pair.workerId)?.senior === true);
    const seniorTerm = sumTerm(seniorHere.map((pair) => pair.name));
    lines.push(` c${constraintIndex++}: ${seniorTerm} >= ${shift.requiredSenior}`);
    lines.push(` c${constraintIndex++}: ${seniorTerm} <= ${shift.maxSenior}`);
  }

  for (const worker of workers) {
    const mine = pairsByWorker.get(worker.id) ?? [];

    for (let leftIndex = 0; leftIndex < mine.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < mine.length; rightIndex += 1) {
        const leftPair = mine[leftIndex];
        const rightPair = mine[rightIndex];
        if (!leftPair || !rightPair) {
          continue;
        }

        const leftShift = shiftById.get(leftPair.shiftId);
        const rightShift = shiftById.get(rightPair.shiftId);
        if (!leftShift || !rightShift) {
          continue;
        }

        if (restGap(leftShift, rightShift) < MIN_REST_HOURS) {
          lines.push(
            ` c${constraintIndex++}: ${leftPair.name} + ${rightPair.name} <= 1`,
          );
        }
      }
    }
  }

  const countVarBounds: string[] = [];

  for (const worker of workers) {
    const mine = pairsByWorker.get(worker.id) ?? [];
    const term = sumTerm(mine.map((pair) => pair.name));
    const countVar = `count_${worker.id}`;

    if (mine.length > 0) {
      lines.push(` c${constraintIndex++}: ${term} - ${countVar} = 0`);
    } else {
      lines.push(` c${constraintIndex++}: ${countVar} = 0`);
    }

    lines.push(` c${constraintIndex++}: max_shifts - ${countVar} >= 0`);
    lines.push(` c${constraintIndex++}: min_shifts - ${countVar} <= 0`);
    countVarBounds.push(countVar);
  }

  lines.push("Bounds");
  lines.push(" max_shifts >= 0");
  lines.push(" min_shifts >= 0");

  for (const countVar of countVarBounds) {
    lines.push(` ${countVar} >= 0`);
  }

  if (relaxCoverage) {
    for (const shift of shifts) {
      lines.push(` 0 <= short_${shift.id} <= ${shift.requiredTotal}`);
    }
  }

  lines.push("Binaries");
  lines.push(` ${pairs.map((pair) => pair.name).join(" ")}`);
  lines.push("General");
  lines.push(` max_shifts min_shifts ${countVarBounds.join(" ")} ${shortNames.join(" ")}`.trimEnd());
  lines.push("End");

  return lines.join("\n");
}

export async function solveSchedule(
  workers: SolverWorker[],
  shifts: SolverShift[],
  relaxCoverage: boolean,
): Promise<ModelResult> {
  const workerAvail = new Map(
    workers.map((worker) => [worker.id, availAbsRange(worker.availability)]),
  );
  const pairs: Pair[] = [];

  for (const worker of workers) {
    const windows = workerAvail.get(worker.id) ?? [];

    for (const shift of shifts) {
      if (isAvailable(worker, shift, windows)) {
        pairs.push({
          workerId: worker.id,
          shiftId: shift.id,
          name: `x_${worker.id}_${shift.id}`,
        });
      }
    }
  }

  if (pairs.length === 0 || shifts.length === 0 || workers.length === 0) {
    return { status: "infeasible", assignments: [] };
  }

  const pairsByShift = new Map<string, Pair[]>();
  const pairsByWorker = new Map<string, Pair[]>();

  for (const pair of pairs) {
    const shiftPairs = pairsByShift.get(pair.shiftId) ?? [];
    shiftPairs.push(pair);
    pairsByShift.set(pair.shiftId, shiftPairs);

    const workerPairs = pairsByWorker.get(pair.workerId) ?? [];
    workerPairs.push(pair);
    pairsByWorker.set(pair.workerId, workerPairs);
  }

  const highs = await loadHighs();
  const solution = highs.solve(
    buildModel(workers, shifts, pairs, pairsByShift, pairsByWorker, relaxCoverage),
  );

  if (solution.Status !== "Optimal") {
    return { status: "infeasible", assignments: [] };
  }

  const assignments: ModelAssignment[] = [];

  for (const pair of pairs) {
    if (primalValue(solution.Columns[pair.name]) > 0.5) {
      assignments.push({ shiftId: pair.shiftId, workerId: pair.workerId });
    }
  }

  return { status: "ok", assignments };
}
