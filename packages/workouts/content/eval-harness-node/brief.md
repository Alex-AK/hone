# Settle the argument about Tuesday

Somebody changed the assistant's prompt on Tuesday morning. Half the team has been saying since that
it got worse, and half has been saying it is the same. Two days of that and nobody has produced a
number either side will accept.

There is a case set, a folder of answers recorded before the change and after it, and a script that
reads one answer per case and says whether it was right. That script is why the argument is still
going: run it twice on the same recordings and it says the same thing, run it on Monday and it says
everything is fine, and neither side thinks it is measuring anything.

## The task

One file: **`src/lib/harness.ts`**. `evaluate(cases, samples, baseline, tolerance)` reads the
recordings and hands back a `Report`.

**A case is a rate.** The same input has more than one recorded answer, because the assistant is not
deterministic and one answer was never a measurement of it. Grade all of them; the case's result is
how many passed over how many there were. The report's overall figure is the mean of the case rates,
not of the answers: a case somebody ran six times is one case.

**A case nobody ran did not score zero.** It has no rate at all. Name it in `notRun` and keep it out
of the mean.

**A failing answer survives into the report.** Keep it as it came back, with what was wrong with it.
A rate says something got worse; the answer is the only part anybody can act on, and it is gone once
it has been counted.

**A rate is read against the baseline.** A case has regressed when it fell further than `tolerance`
below what the baseline says it scored. Falling less than that is not a regression: a case set this
size moves on its own, and a gate that fails on that is a gate somebody turns off. Three more things
are neither regressions nor passes, and each gets its own list: a case with no baseline entry
(`appeared`), a baseline entry the set no longer has (`disappeared`), and `notRun`. `ok` is true only
when all four lists are empty.

## What you are given

**`src/cases/set.ts`** is the case set. Each case carries its own `check`, because "what is the
refund window" has one right answer and "explain how refunds work" has a hundred.

**`src/lib/graders.ts`** is `grade(check, output)`, which picks the right one of the four and answers
`{ ok, why }`. Read what two of them let through before you trust a number that came out of them: the
JSON grader checks the shape and never the values, and `contains` is case-insensitive and cares
nothing for order.

**`src/model/samples.ts`** is the recordings. `recorded('monday')` is before the change and
`recorded('tuesday')` is after it. `outputs(caseId)` hands back every answer for that case, and an
empty array for one nobody ran.

**`src/lib/baseline.ts`** is what the case set scored on Monday, which is the only thing that makes a
number on Tuesday mean anything.

## Notes

Nothing here reaches a network and nothing samples anything at run time. Every answer in
`samples.ts` came back from the assistant at some point and was written down, which is why the same
input has several of them and why the number of them differs between cases: the ones nobody trusted
were run more.

Nothing is imported from outside these files except `zod`. `npm`-style commands are not available:
hit **Run checkpoints** to see where you are.

## If you finish early

- A tolerance of a fifth over four to six samples is a blunt instrument, and it is blunt in both
  directions. Work out how many samples a case would need before a fall of a tenth meant anything,
  and whether you would rather have that or more cases.
- One recorded answer calls a furious customer pleased, and it passes. Decide what would have to
  change for that to be caught, and what the new grader would then let through instead.
- `ok` fails the run for a case nobody ran. Decide whether you would ship that rule, and what
  somebody does about it at five o'clock on a Friday.
