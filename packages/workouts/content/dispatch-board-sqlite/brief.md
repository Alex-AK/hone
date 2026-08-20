# The board and the warehouse disagree

The dispatch board is the screen the warehouse works from: everything booked, what is being picked,
what has gone out, with parcel counts and weights. Ops sent three complaints about it this week.

- A consignment the customer cancelled on Monday afternoon was picked, packed and loaded on Tuesday
  morning. The board had it waiting for a picker the whole time. Customer service had it as cancelled
  since Monday, on the screen they always use.
- Twice last month a consignment on the board showed twice the parcels it holds, and twice the
  weight. Both were busy mornings, and the second one was the morning after the relay had been down
  for an hour.
- There is a **Repair board** button for when the board looks wrong. It brought back the two
  consignments that had gone missing from the board, both showing no parcels at all, and left the
  double-counted one saying exactly what it had said before.

## The task

`src/server/board.ts` and `src/server/consignments.ts` are yours. `src/server/db.ts` builds the
database and is not editable.

What has to be true when you are done:

- Every change made to a consignment reaches the board, so what the warehouse reads matches what the
  consignment tables hold.
- **The relay is at-least-once.** It will hand the same change over twice, and it does exactly that
  when it catches up after an outage. Applying a change twice has to leave the board where applying
  it once left it.
- **Repair board** makes the board agree with the consignments: nothing missing, nothing left over,
  no wrong numbers. Running it twice is the same as running it once.
- **The board page keeps reading the board.** `listBoard` stays a single read of `board_row` and does
  not join back to `consignment` or `parcel`. The board table exists so the page renders without
  them, and a checkpoint holds you to it.
- `applyChange`, `rebuildBoard`, `listBoard` and the five functions in `consignments.ts` keep the
  signatures they have. Everything else across those two files is yours to move.
- No new dependency.

## Notes

`db.ts` builds an in-memory database with these three tables in it, four consignments, six parcels,
and a board that agrees with them at the start.

```sql
CREATE TABLE consignment (
  id INTEGER PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  customer TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('booked', 'picking', 'dispatched', 'cancelled')),
  booked_at TEXT NOT NULL
);

CREATE TABLE parcel (
  id INTEGER PRIMARY KEY,
  consignment_id INTEGER NOT NULL,
  barcode TEXT NOT NULL,
  weight_grams INTEGER NOT NULL
);

CREATE TABLE board_row (
  consignment_id INTEGER PRIMARY KEY,
  reference TEXT NOT NULL,
  customer TEXT NOT NULL,
  status TEXT NOT NULL,
  parcel_count INTEGER NOT NULL,
  total_grams INTEGER NOT NULL,
  booked_at TEXT NOT NULL
);
```

- `applyChange` is the only way the board is updated. The write paths in `consignments.ts` call it,
  and so does the relay that replays changes after an outage, which is where a second delivery of the
  same change comes from.
- `db.prepare(sql)` is better-sqlite3, so every call on it is synchronous. `.run(...)` answers with
  `{ changes, lastInsertRowid }`, `.get(...)` with a row or `undefined`, `.all(...)` with an array.
- `db.transaction(fn)` returns a function that runs `fn` between BEGIN and COMMIT and undoes all of
  it if `fn` throws.
- `db.statements` is the query log: the SQL of every statement run on the connection, oldest first.
  `db.clearStatements()` empties it. The last checkpoint reads it to see what the board page asked
  the database for. You do not need to call either.

`npm`-style commands are not available here. Hit **Run checkpoints** to see where you are.

## If you finish early

- The relay can deliver changes out of order as well as twice. Work out whether what you wrote
  survives a status change arriving before the booking it belongs to, and what it would take if it
  does not.
- Nothing here notices drift. A rebuild is a repair somebody has to decide to run, so work out what
  would tell them: a check that compares the board against the consignments, how often it runs, and
  what it does when the two disagree.
- Repair board rebuilds every row. Decide what that means on a table with a million consignments in
  it, and whether the answer is a smaller rebuild, a slower one, or a different button.
