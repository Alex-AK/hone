import type { Case } from '../cases/set';
import type { Samples } from '../model/samples';
import type { Baseline } from './baseline';
import { grade } from './graders';

/** One case, over every answer that was recorded for it. */
export interface CaseResult {
  id: string;
  samples: number;
  passed: number;
  /** Between 0 and 1. It is a measurement, so it is a fraction and not a verdict. */
  rate: number;
  /** Every answer that did not pass, kept as it came back. */
  failures: { output: string; why: string }[];
}

export interface Report {
  cases: CaseResult[];
  /** The mean of the case rates, over the cases that ran. */
  rate: number;
  /** Cases in the set that nobody ran. */
  notRun: string[];
  /** Cases that ran and have nothing to be read against. */
  appeared: string[];
  /** Baseline entries the set no longer has. */
  disappeared: string[];
  /** Cases whose rate fell further than the tolerance allows. */
  regressions: string[];
  ok: boolean;
}

/**
 * Reads one answer per case and says whether it was right, which is what
 * everybody writes first and is why nobody could settle the argument about
 * Tuesday.
 *
 * TODO: a case has more than one recorded answer and its result is a rate over
 * all of them; a failing answer has to survive into the report or the report
 * cannot be acted on; a case nobody ran did not score zero; and a rate means
 * nothing except against the baseline it is being compared with. See brief.md.
 */
export function evaluate(
  cases: Case[],
  samples: Samples,
  baseline: Baseline,
  tolerance: number
): Report {
  const results: CaseResult[] = [];
  const regressions: string[] = [];

  for (const testCase of cases) {
    const output = samples.outputs(testCase.id)[0] ?? '';
    const ok = grade(testCase.check, output).ok;
    results.push({
      failures: [],
      id: testCase.id,
      passed: ok ? 1 : 0,
      rate: ok ? 1 : 0,
      samples: 1,
    });
    if ((baseline.rate[testCase.id] ?? 0) !== (ok ? 1 : 0)) regressions.push(testCase.id);
  }

  void tolerance;

  return {
    appeared: [],
    cases: results,
    disappeared: [],
    notRun: [],
    ok: regressions.length === 0,
    rate: results.reduce((total, result) => total + result.rate, 0) / results.length,
    regressions,
  };
}
