import type { Check } from '../cases/set';

/**
 * The four graders, one per kind of case. `why` is written for whoever opens
 * the report afterwards, so it says what was wrong with this answer rather than
 * that something was.
 *
 * Given to you, and not part of the exercise. Two of them are worth reading
 * before you use them, because what they let through is the point: `json`
 * checks the shape and never the values, so a confidently wrong classification
 * passes it, and `contains` is case-insensitive and cares nothing for order.
 */
export interface Verdict {
  ok: boolean;
  why: string;
}

export function grade(check: Check, output: string): Verdict {
  const answer = output.trim();

  switch (check.kind) {
    case 'exact':
      return answer === check.value
        ? { ok: true, why: '' }
        : { ok: false, why: `expected exactly "${check.value}"` };

    case 'contains': {
      const haystack = answer.toLowerCase();
      const missing = check.all.filter((needle) => !haystack.includes(needle.toLowerCase()));
      return missing.length === 0
        ? { ok: true, why: '' }
        : { ok: false, why: `does not mention ${missing.map((m) => `"${m}"`).join(' or ')}` };
    }

    case 'json': {
      let body: unknown;
      try {
        body = JSON.parse(answer);
      } catch {
        return { ok: false, why: 'not JSON' };
      }
      const parsed = check.shape.safeParse(body);
      return parsed.success
        ? { ok: true, why: '' }
        : { ok: false, why: `JSON of the wrong shape: ${parsed.error.issues[0]?.message ?? ''}` };
    }

    case 'number': {
      const found = /-?\d+(?:\.\d+)?/.exec(answer.replace(/,/g, ''));
      if (!found) return { ok: false, why: 'no number in the answer' };
      const value = Number(found[0]);
      return Math.abs(value - check.value) <= check.tolerance
        ? { ok: true, why: '' }
        : { ok: false, why: `answered ${value}, wanted ${check.value}` };
    }
  }
}
