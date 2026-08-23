import { CASES } from '../../src/cases/set';
import { MONDAY } from '../../src/lib/baseline';
import { type CaseResult, evaluate, type Report } from '../../src/lib/harness';
import { recorded } from '../../src/model/samples';

/** The tolerance the team settled on: a fifth of a case set of this size. */
export const TOLERANCE = 0.2;

export function report(run: 'monday' | 'tuesday' = 'tuesday', tolerance = TOLERANCE): Report {
  return evaluate(CASES, recorded(run), MONDAY, tolerance);
}

export function caseNamed(result: Report, id: string): CaseResult {
  const found = result.cases.find((entry) => entry.id === id);
  if (!found) throw new Error(`no result for ${id}: ${result.cases.map((c) => c.id).join(', ')}`);
  return found;
}
