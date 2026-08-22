# Retry with backoff

The billing provider was down for ninety seconds on Tuesday afternoon. Every call we made into that
window turned into an error page for a customer, their graph of our traffic has a spike sitting on
top of the outage, and support has two people who were charged twice.

## The task

One file: **`src/lib/retry.ts`**. `RetryingClient.request(request)` makes the call, decides whether
to make it again, and answers the caller.

**What is worth another attempt.** 429, 502, 503 and 504, plus any attempt that ended with no answer
at all.

**What comes straight back.** Every other status the downstream chose to send, a 200 and a 400 and a
500 alike. A retry loop is not the place to fix a bad request or a broken handler, and sending those
again only spends time being told the same thing.

**What must not be sent twice.** An attempt that ended without an answer is the ambiguous one: what
was lost is the answer, not the request, so it may already have been carried out. Send one of those
again only where twice is the same as once: GET, PUT and DELETE, or any request carrying an
`idempotency-key` header. A POST without one stops there. A POST that came back 503 is a different
case, because the downstream answered.

**How long to wait first.** Full jitter, which is `random()` times the whole window:
`random() * Math.min(capMs, baseMs * 2 ** waits)`, where `waits` is how many waits you have already
made. Nothing waits before the first attempt. When a retryable response carries `Retry-After`, that
wins: wait exactly the seconds it names and leave `random` alone. Here it is always a positive whole
number of seconds.

**When to stop.** Two ways, both asked between attempts. `maxAttempts` counts the first attempt.
`budgetMs` covers the whole operation from the moment `request` was called, and no attempt starts
that cannot finish inside it, so once `clock.now()` plus `timeoutMs` is past that deadline, stop.

**Say so.** Giving up throws `GaveUpError(reason, attempts, lastStatus)`. The reason is
`out-of-attempts`, `out-of-budget` or `not-safe-to-retry`, `attempts` is how many you made, and
`lastStatus` is the status the last attempt came back with, or `null` if it got none.

## What you are given

**`src/lib/clock.ts`** is a clock the checkpoints drive. `now()` reads it, `sleep(ms)` resolves once
the clock has moved that far, and `deadline(ms)` hands back an `AbortSignal` that fires at the same
point. Nothing moves the clock except a checkpoint, so a thirty-second wait costs the suite nothing.
Real timers hang the suite instead of firing. The checkpoints read the durations asked of both
`sleep` and `deadline`, so take a deadline from the clock rather than racing a `sleep` against the
call.

**`src/lib/downstream.ts`** is the one call that leaves this process. `send(request, signal?)`
resolves with whatever the downstream answered, whatever the status, and rejects when nothing came
back. Response headers arrive lowercased, so it is `retry-after`.

**`src/lib/errors.ts`** holds `GaveUpError`, which the checkpoints assert on by class and by field,
and the two rejections `send` produces: `RequestAbortedError` once a deadline fires, and
`ConnectionLostError` when the connection dies. Your code does not need to tell those two apart.

**`deps.random`** is the jitter, and it returns a number in `[0, 1)` exactly as `Math.random` does.
It is injected for the same reason the clock is: the checkpoints hand it a fixed sequence, and
`Math.random` would make them a coin flip. Do not reach past it.

## The last checkpoint

The first four drive outages somebody wrote. The last one generates them: the options, the request,
the jitter, and what the downstream does to each attempt in turn. Three things about those outages
are worth knowing. The downstream rarely does the same thing twice running, so a wait can follow an
attempt nobody answered, and an attempt that got no answer is as often a deadline you fired yourself
as a connection that died. The clock does not always read zero when `request` is called. And the
budget is often tight enough that whether one more attempt fits is the whole question.

It adds no rules. Everything it checks is on this page already. When it fails it leads with the rule
that broke and then prints the shortest outage that still breaks it, which is a complete
reproduction: those options, that request, those replies, in that order.

## Notes

The downstream the checkpoints put behind `send` answers in the same tick or not at all. A scripted
status comes back immediately without moving the clock, and a scripted hang settles only when the
signal you passed it aborts, so an attempt sent without one waits forever.

The clock only moves when something waits on it, which means a run where every attempt is answered
immediately spends none of its budget. That is the fake being fake: take the budget deadline from
`clock.now()` at the top of `request` and the checkpoints will move the clock for you.

Nothing is imported from outside these four files, and nothing needs to be. `npm`-style commands are
not available: hit **Run checkpoints** to see where you are.

## If you finish early

- A cap per call still lets fifty callers each triple their traffic at a downstream that is already
  struggling. Work out what a budget shared across every call would have to count, and what it costs
  the one caller refused in order to protect the rest.
- Everything here retries at one layer. Decide what your own caller retrying as well does to these
  numbers, and where the deadline for the whole user action should actually live.
- `Retry-After` can carry an HTTP date rather than a count of seconds. Work out what this clock would
  have to know before it could honour that one.

---

Credit: the full-jitter formula is Marc Brooker's, from "Exponential Backoff And Jitter" on the AWS
Architecture Blog.
