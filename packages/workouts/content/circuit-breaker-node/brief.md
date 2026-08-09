# Build a circuit breaker

The payments provider is down. Every request to it waits the full timeout, fails, and the next one
does exactly the same, so a dependency that is answering nothing is still costing you a connection
and several seconds per request. Build the thing that notices and stops asking.

## The task

One file: **`src/lib/breaker.ts`**. `CircuitBreaker` wraps a call and has three states.

**Closed** is normal. Calls go through, and the value and the error both come back untouched.
Count consecutive failures; a success resets the count to zero. When the count reaches
`failureThreshold`, open.

**Open** means stop asking. `call` throws `CircuitOpenError` immediately, without invoking the
function. It stays that way for `openMs`.

**Half-open** is the second chance. Once `openMs` has passed, the next call goes through as a
trial: exactly one, with anything else arriving meanwhile refused as if the circuit were still
open. A trial that succeeds closes the circuit and clears the count. A trial that fails opens it
again, and the wait starts over from that moment.

**A call that runs longer than `timeoutMs` is a failure.** It throws `CallTimeoutError` and counts
towards the threshold like any other. Without this, a dependency that hangs instead of failing
never trips anything: the counter only moves when a call finishes, and those calls never do.

## What you are given

**`src/lib/clock.ts`** is a clock the checkpoints drive. `now()` reads it, `sleep(ms)` resolves
when the clock has moved that far, and nothing moves it except the checkpoint calling `advance()`.
Use it for both the wait and the timeout. Real timers will hang the suite instead of firing.

**`src/lib/errors.ts`** holds `CircuitOpenError` and `CallTimeoutError`. The checkpoints assert on
these classes, so throw these rather than plain errors.

## The last checkpoint

The first four drive schedules somebody chose. The last one generates them, along with the
threshold, the wait and the timeout, and checks that the rules above held whatever the schedule
turned out to be. It adds no rules: everything it asserts is on this page already. When it fails it
prints the shortest schedule that breaks one, which is usually two or three steps and is a complete
reproduction.

## Notes

`state` is read by the checkpoints between calls, and it is derived rather than stored: whether the
wait is over is a question about the clock, so half-open is what open becomes once `openMs` has
passed rather than a transition somebody has to remember to make.

Racing a call against a timeout leaves a loser, and the loser here settles later, when the clock
moves. Resolve the losing branch to a value you can recognise rather than rejecting from it, or the
suite fails on an unhandled rejection a checkpoint or two after the one that caused it.

Nothing is imported from outside these three files, and nothing needs to be. `npm`-style commands
are not available: hit **Run checkpoints** to see where you are.

## If you finish early

- A consecutive-failure count treats one bad call in a hundred the same as ten in a row, and never
  opens under partial failure. Swap it for a rolling window and decide what "50% of the last 20"
  should do when only three calls have been made.
- Every caller currently waits `timeoutMs` for the same dead dependency. Work out what a breaker
  per host buys you that one breaker in front of the client does not.
- A trial call is a real user's request, and it is the one you chose to gamble with. Decide whether
  that is acceptable, and what the alternative costs.

---

Credit: the pattern is Michael Nygard's, from _Release It!_, and the state names here are the ones
that book gave it.
