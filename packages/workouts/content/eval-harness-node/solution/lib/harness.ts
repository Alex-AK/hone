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

export function evaluate(
  cases: Case[],
  samples: Samples,
  baseline: Baseline,
  tolerance: number
): Report {
  const results: CaseResult[] = [];
  const notRun: string[] = [];
  const appeared: string[] = [];
  const regressions: string[] = [];

  for (const testCase of cases) {
    const outputs = samples.outputs(testCase.id);
    // Nobody ran it, which is not the same as it getting everything wrong. A
    // rate over no answers is not zero, it is nothing, so this case has none.
    if (outputs.length === 0) {
      notRun.push(testCase.id);
      continue;
    }

    const failures: CaseResult['failures'] = [];
    let passed = 0;
    for (const output of outputs) {
      const verdict = grade(testCase.check, output);
      if (verdict.ok) passed += 1;
      // The answer is kept rather than counted. A rate says something got
      // worse; only the answer says what, and it is gone once it is a number.
      else failures.push({ output, why: verdict.why });
    }

    const rate = passed / outputs.length;
    results.push({ failures, id: testCase.id, passed, rate, samples: outputs.length });

    const before = baseline.rate[testCase.id];
    if (before === undefined) {
      appeared.push(testCase.id);
      continue;
    }
    if (before - rate > tolerance) regressions.push(testCase.id);
  }

  const inTheSet = new Set(cases.map((testCase) => testCase.id));
  const disappeared = Object.keys(baseline.rate).filter((id) => !inTheSet.has(id));

  // The mean of the case rates rather than of the answers: a case somebody ran
  // six times is one case, and sampling it more is not a reason for it to count
  // more than the one somebody ran four times.
  const rate =
    results.length === 0
      ? 0
      : results.reduce((total, result) => total + result.rate, 0) / results.length;

  return {
    appeared,
    cases: results,
    disappeared,
    notRun,
    ok: regressions.length === 0 && notRun.length === 0 && disappeared.length === 0,
    rate,
    regressions,
  };
}
