---
title: Two writers, one row
question: Two people saved the same record and one of the edits is gone. Where do I stop that?
order: 9
practise:
  - sql-optimistic-update-zero-rows
  - sql-for-update-across-requests
  - sql-serializable-needs-retry
  - orm-save-reads-first
  - shared-card-websocket
  - class-places-sqlite
sources:
  - author: PostgreSQL
    title: Data Consistency Checks at the Application Level
    url: https://www.postgresql.org/docs/current/applevel-consistency.html
  - author: PostgreSQL
    title: Explicit Locking
    url: https://www.postgresql.org/docs/current/explicit-locking.html
  - author: PostgreSQL
    title: Client Connection Defaults
    url: https://www.postgresql.org/docs/current/runtime-config-client.html
  - author: PostgreSQL
    title: Date/Time Functions and Operators
    url: https://www.postgresql.org/docs/current/functions-datetime.html
  - author: SQLite
    title: Date And Time Functions
    url: https://www.sqlite.org/lang_datefunc.html
  - author: David Rice
    title: Optimistic Offline Lock, in Patterns of Enterprise Application Architecture
    url: https://martinfowler.com/eaaCatalog/optimisticOfflineLock.html
  - author: David Rice
    title: Pessimistic Offline Lock, in Patterns of Enterprise Application Architecture
    url: https://martinfowler.com/eaaCatalog/pessimisticOfflineLock.html
  - author: MDN
    title: If-Match
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/If-Match
verified: 2026-08-07
---

Two pages own the mechanisms this one chooses between. [Transactions and ACID](./transactions-and-acid.md)
has the isolation levels and what `SELECT ... FOR UPDATE` does;
[conditional requests](../headers/conditional-requests-and-ranges.md) has `If-Match` and its `412`.
Every Postgres behaviour below was produced by running it on two connections to PostgreSQL 17.10, and
the quoted statements are from the PostgreSQL 18 documentation. The SQLite behaviour was run against
3.53.2 through better-sqlite3.

## The model

A read-then-write is not a write. The row you read is a copy, the write lands later, and every answer
here is a different way of protecting the gap between the two. So the first question is not which kind
of locking. It is how long that gap is, and there are three lengths.

**A gap you can delete.** Where the new value is a function of the stored one, do not bring it into
your process at all: say it in the statement.
`UPDATE classes SET places_left = places_left - 1 WHERE id = ? AND places_left > 0` has no read to go
stale, and the row count says whether the condition held when the write landed. `class-places-sqlite`
is a whole workout of that shape, and the neighbouring page makes the same move on a balance. Try it
before anything below, because a lock is an expensive answer to a question you did not have to ask.

**A gap inside one transaction.** Where the decision needs the data in your process, checking a
membership or totting up a basket, the read and the write are two statements with your code between
them. Lock the row you read. `SELECT ... FOR UPDATE` stops the returned rows "from being locked,
modified or deleted by other transactions until the current transaction ends", and a second
transaction asking for the same row "will wait for a concurrent transaction that has run any of those
commands on the same row, and will then lock and return the updated row". The Postgres documentation
is direct about when you need it: to ensure the current validity of a row against concurrent updates
"one must use `SELECT FOR UPDATE`, `SELECT FOR SHARE`, or an appropriate `LOCK TABLE` statement".
SQLite has no row lock and rejects the clause outright, with `near "FOR": syntax error`; what it
offers instead is `BEGIN IMMEDIATE`, which is the whole database.

**A gap that outlives the transaction.** The edit form is this one. A `GET` renders it, somebody goes
to lunch, the `PUT` arrives forty minutes later, and the two requests share no transaction and
probably no connection. Row-level locks "are released at transaction end", so there is nothing left
holding anything by the time the save turns up. What can cross that gap is data: send the version you
read back with the write, and let the write assert what it was built on. `WHERE id = ? AND version = ?`
matches nothing once the row has moved, so a lost update arrives as a row count of 0, which is a
conflict you can show somebody.

The last two are the pessimistic and optimistic offline lock of Patterns of Enterprise Application
Architecture, offline because the business transaction spans several database ones. The names mislead
in one way: optimistic is not the version with no lock. An `UPDATE` takes a row lock on what it
modifies either way, and a second writer to that row waits for the first to finish. What optimistic
declines to do is hold a lock across a human being.

The version itself is anything that changes on every write and travels out with the read: a counter, a
row hash, an ETag over the whole representation. One layer up the same check is spelled `If-Match`,
where a mismatch is a `412` rather than a row count of 0, and
[conditional requests](../headers/conditional-requests-and-ranges.md) owns that half.

### What to do with the conflict is a product decision

Detecting one is the cheap half. By the time you hold that 0, somebody has to be told something, and
there are three answers:

- **Refuse.** Answer `409` with what the row says now and let the person decide. This is the right
  answer wherever the field is prose a human wrote, because nothing can merge two paragraphs for them.
- **Merge.** Only where the edits are separable, which in practice means per field rather than per
  row. `shared-card-websocket` keeps the version at which each field last changed, so a title and a
  status moving at once both stick and only two people on the same field is a conflict.
- **Last writer wins.** A legitimate answer when you say it out loud: a draft nobody else edits, a
  status a webhook owns. It is also what you get by not choosing, which is the whole problem. Chosen,
  it is a decision somebody can find later; unchosen, it is an edit that disappears with a `200` on
  it.

## Worked example

Two connections to PostgreSQL 17.10, both at the default Read Committed, on a document at version 7.
First with nothing protecting the gap:

```sql
-- A                                       -- B
BEGIN;                                     BEGIN;
SELECT body, version FROM documents        SELECT body, version FROM documents
  WHERE id = 42;   -- 'draft', 7             WHERE id = 42;   -- 'draft', 7
UPDATE documents SET body = 'draft + A'
  WHERE id = 42;   -- UPDATE 1
COMMIT;
                                           UPDATE documents SET body = 'draft + B'
                                             WHERE id = 42;   -- UPDATE 1
                                           COMMIT;

-- body is 'draft + B'. A's paragraph is gone, and both writers were told UPDATE 1.
```

Nothing there is the database misbehaving. Neither statement made a claim about the row still being
what was read, so there was nothing to violate. Now the same interleaving with the version carried
back into the write:

```sql
-- A
UPDATE documents SET body = 'draft + A', version = version + 1
  WHERE id = 42 AND version = 7;   -- UPDATE 1
-- B
UPDATE documents SET body = 'draft + B', version = version + 1
  WHERE id = 42 AND version = 7;   -- UPDATE 0
```

Same two writers, same order, and B now gets an answer instead of a silence. The handler is that row
count plus one re-read:

```ts
const { rowCount } = await db.query(
  `UPDATE documents SET title = $1, body = $2, version = version + 1
     WHERE id = $3 AND version = $4`,
  [form.title, form.body, id, form.version]
);

if (rowCount === 0) {
  // Nothing matched, and that is a row that moved or a row that is not there.
  const { rows } = await db.query('SELECT * FROM documents WHERE id = $1', [id]);
  return rows[0] ? res.status(409).json(rows[0]) : res.sendStatus(410);
}
```

## Traps

**The conflict rate dropped to zero after the fix and edits are still going missing.** The handler
caught the failed update, re-read the row and ran the write again with the version that came back.
That is the lost update with a spinner in front of it: the second attempt is built on a value nobody
looked at, and it overwrites the change that caused the conflict. Retrying is only safe where the new
value does not depend on what was read, which is the first case in the model, and there you did not
need the version anyway. Everything else has to reach a merge rule or a person.

**`updated_at` was the validator and a stale write went through.** A timestamp only works as a version
if it changes on every write and has the resolution to prove it. SQLite's `CURRENT_TIMESTAMP` is whole
seconds: on 3.53.2 it answers `2026-08-08 03:53:50`, so two saves in the same second are
indistinguishable and the later one matches the earlier one's `WHERE`. `datetime('now', 'subsec')`
buys milliseconds, which shrinks the window rather than closing it. Postgres has the opposite
surprise: `now()` and `CURRENT_TIMESTAMP` are the transaction's start time and "do not change during
the transaction", so every row one transaction touches carries the same stamp, and `clock_timestamp()`
is the one that moves. A counter incremented in the `SET` clause has neither problem.

**One row went quiet and the endpoint stopped answering for everybody who touched it.** A row lock is
held until the transaction ends, so a transaction that takes one and then calls a payment provider
holds it for the length of that call, and every writer to that row is queued behind it. Nothing puts a
limit on that by default: for both `lock_timeout` and `idle_in_transaction_session_timeout`, "a value
of zero (the default) disables the timeout". Set `lock_timeout` on the transactions that take row
locks, and keep anything you wait on outside them.

**The version column is there, the update looks right, and stale writes still land.** The row count is
the entire signal, and it is easy to throw away without noticing. An ORM `save` reads the row first, merges
your object into it and writes the difference back, keyed on the primary key: that is a read-then-write
with the gap moved inside one call, and the version is not in its `WHERE` unless the ORM was told to
put it there. Whatever you call, find out whether it returns a count, the updated row, or nothing at
all before you believe the check is running.
