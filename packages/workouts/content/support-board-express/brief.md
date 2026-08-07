# The board the client already knows how to draw

The support board was built client-side first, against a stub, and it went out last week. It now
points at the real `GET /board` and support have three complaints:

- "There are only four columns. Nothing is waiting on a customer today, and that column has gone."
- "Every heading says 10. There are forty-odd tickets in Done."
- "Half the time it says the board could not be loaded and shows me nothing at all."

The client is shipped. It is not changing this sprint, and the shape it parses is the shape it
parses.

## The task

Answer what the client asks for, in `src/server/board.ts`.

**Every column comes back.** Five statuses, in the order `STATUSES` lists them, whether or not
anybody has a ticket in one.

**The number under a heading counts the column.** How many tickets are in that status altogether,
alongside the page of cards the client draws.

**A busy board costs the same as a quiet one.** The number of statements the request runs must not
follow the number of tickets on the board.

**The payload is the shape the client declared.** `parseBoard` in `src/client/contract.ts` is the
parser it runs before it renders anything, and a card that fails it is the whole board failing.

## Notes

`src/client/contract.ts` is the client's half of the contract, and it is read-only. Read it: it is
the specification. It refuses fields it does not know about, on purpose, so an extra key is a
failure rather than something ignored.

`db.queries` is every statement the request has run, in order. A checkpoint clears it and reads it
back. Preparing a statement costs nothing there; executing one is what lands in the log.

The board holds 94 tickets across four of the five statuses. Five of them were opened by the mail
importer in a single go and carry the same `updated_at` to the millisecond.

`npm`-style commands are not available here. Hit **Run checkpoints** to see where you are.

## If you finish early

- The client draws ten cards and says "and 24 more". Work out what it would take to open a column,
  and whether that is this endpoint with a parameter or a different one.
- Two people move a ticket while a third is loading the board. Decide what the counts and the cards
  can disagree about, and whether reading them in one transaction is worth what it costs.
- The contract refuses unknown fields, so adding one breaks every client that has not deployed yet.
  Work out what the rollout order has to be, and which half of it you do not control.
