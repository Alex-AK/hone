---
title: Monolith, modules, services
question: Should this be one deployable or three, and what does the second answer cost?
order: 1
practise:
  - sys-timeout-before-breaker
  - http-retry-amplification
  - sys-module-boundary-imports
  - sys-split-shared-database
  - sys-dual-write-two-orderings
sources:
  - author: Martin Fowler
    title: Microservice Trade-Offs
    url: https://martinfowler.com/articles/microservice-trade-offs.html
  - author: Martin Fowler
    title: MonolithFirst
    url: https://martinfowler.com/bliki/MonolithFirst.html
  - author: Martin Fowler
    title: PresentationDomainDataLayering
    url: https://martinfowler.com/bliki/PresentationDomainDataLayering.html
  - author: Chris Richardson
    title: 'Pattern: Database per service'
    url: https://microservices.io/patterns/data/database-per-service.html
verified: 2026-08-09
---

## The model

Two different things get called a boundary. A **module** boundary is enforced by a compiler, a lint
rule or a package graph, and moving it is a refactor somebody does in an afternoon. A **service**
boundary is enforced by a network, and moving it is a coordinated release across two deployables.
The question is never which one is tidier. It is which enforcement mechanism you are buying, and
what it charges.

What a service boundary buys is real, and Fowler's list is short: "Microservices reinforce modular
structure, which is particularly important for larger teams", and "Simple services are easier to
deploy, and since they are autonomous, are less likely to cause system failures when they go wrong."
Independent deploys, independent scaling, a failure that stays local, and a thing a team can own
outright.

The bill is four items, and every one of them lands on code that already worked.

- **A call can now fail on its own.** "You expect in-process function calls to work, but a remote
  call can fail at any time. With lots of microservices, there's even more potential failure points."
- **The calls add up.** "Remote calls are slow. If your service calls half-a-dozen remote services,
  each which calls another half-a-dozen remote services, these response times add up to some
  horrible latency characteristics."
- **A transaction stops being one.** "Microservices require multiple resources to update, and
  distributed transactions are frowned on (for good reason). So now, developers need to be aware of
  consistency issues."
- **Operations multiplies.** "Being able to swiftly deploy small independent units is a great boon
  for development, but it puts additional strain on operations as half-a-dozen applications now turn
  into hundreds of little microservices."

**The middle option is the one that gets skipped.** One deployable, with boundaries something
actually enforces: a lint rule on imports, a package graph, a build that goes red. It catches the
same accidental coupling, costs nothing at runtime, and stays cheap to move when the boundary turns
out to be in the wrong place. It will be, because that is the normal case rather than a failure of
care. Fowler's argument for starting there is that "even experienced architects working in familiar
domains have great difficulty getting boundaries right at the beginning", and a boundary you drew
wrong is refactored inside a monolith and renegotiated across a service.

**The test to apply**: name the thing you cannot do today that a separate deployable would let you
do. Ship on a different cadence. Scale a different resource. Fail without taking the rest down. Hand
it to a team that owns it end to end. If the answer is "keep the code tidy", the answer is a module,
and Fowler prices the difference as a standing charge: "microservices impose a cost on productivity
that can only be made up for in more complex systems."

## Worked example

One change, priced three ways: orders gain a `currency` field.

```
                        one deployable      one deployable       two services
                        no boundaries       enforced modules
change the type         1 edit              1 edit               2 repos
ship it                 1 release           1 release            2 releases, in order
got it wrong            revert              revert               v1 answers a v2 caller
who told you            the compiler        the compiler         checkout started 500ing
reading across it       a function call     a function call      a request, with a deadline
writing across it       one transaction     one transaction      an outbox row and a relay
moving the boundary     a refactor          a refactor           a negotiation
```

The third column is not the wrong answer. It is the price of what the third column buys, which is
that the two halves deploy, scale and fail on their own schedules. Pay it when you are buying
something.

The same call, before and after:

```ts
// same process
const quote = pricing.quote(order); // fails when your code is wrong

// across a service boundary
const quote = await fetch(`${PRICING_URL}/quote`, {
  method: 'POST',
  body: JSON.stringify(order),
  signal: AbortSignal.timeout(300), // it can hang, so it needs a deadline
});
// it can 503 while your code is fine, so this caller needs a plan
// it can succeed twice from one retry, so the other side needs an idempotency key
// it can succeed while your own commit fails, so the pair needs an outbox
```

Three comments, three pages. The deadline is
[circuit breakers](../systems/circuit-breakers.md), the retry is
[idempotency](../apis/idempotency.md), and the pair is
[two systems, one write](../systems/two-systems-one-write.md). None of them was needed the day
before.

## Traps

**Both services shipped, and both still write the `orders` table.** The split moved the code and
left the coupling where it was. A column rename still needs two teams and an ordered release, an
orders migration can still break invoices at 2am, and neither side can change a shape without
asking. Richardson states the rule the other way round: "Keep each microservice's persistent data
private to that service and accessible only via its API." Until the schema is private, you have paid
the whole distributed-systems bill and bought a monolith with a network in it.

**Every feature touches all three services, because the split follows the layers.** An API service,
a logic service and a data service look like a clean decomposition and are one component sliced into
three deployables. Fowler is direct that layering "should only be applied at a relatively small
granularity" and that "once any of these layers gets too big you should split your top level into
domain oriented modules which are internally layered". Split by what changes together, which is a
business capability, not a tier. The team version of the same mistake has the same answer:
"Developers don't have to be full-stack but teams should be."

**Checkout hangs whenever pricing is slow.** Last month that call was a function call, and a
function call does not need a deadline. A remote one does, and without it a slow dependency is not
producing failures for anything to react to, it is producing waits that hold a connection each. The
deadline comes first and the breaker measures what the deadline produces. Retries go on top of that,
carefully: three attempts from each of three callers is nine requests at something already
struggling.

**The order committed and the invoice service never heard about it.** There is no transaction across
two services, so a handler that writes its own row and then calls the other one has two failure
orderings and both lose data. This is its own page, and the answer is to make the second system's
input something the first can write transactionally.

**Four services, one team, one release train.** If they always ship together, the independence you
paid for was never collected. That is worth noticing early, because the fix is cheap while the
boundary is still a module and expensive once it is a repo, a pipeline and an on-call rota.
