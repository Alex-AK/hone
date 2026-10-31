---
title: Two writers, one row
question: Two people saved the same record and one of the edits is gone. Where do I stop that?
order: 9
practise:
  - sql-upsert-not-check-then-insert
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

When two people edit the same record and both save, the second save can wipe out the first, and
both are told it worked. The database is not misbehaving: the app read a copy and wrote it back
later without checking whether anything had changed. This page covers where to close that gap, and
what to tell the person whose edit collided.

## The model

**Every answer here protects the gap between reading a row and writing it, and which one fits
depends on how long that gap is.** This page means Postgres, with SQLite noted where it differs.

**A gap you can delete.** Where the new value is a function of the stored one, do not bring it into
your process: say it in the statement. `UPDATE classes SET places_left = places_left - 1 WHERE id =
? AND places_left > 0` has no read to go stale, and the row count says whether the condition held
when the write landed. `class-places-sqlite` is a workout of that shape, and [Transactions and
ACID](./transactions-and-acid.md) makes the same move on a balance. Try this first.

**A gap inside one transaction.** Where the decision needs the data in your process, lock the row
you read. In Postgres, `SELECT ... FOR UPDATE` stops other transactions locking, modifying or
deleting the returned rows until yours ends, and a second transaction asking for the same row waits,
then locks and gets the updated row. SQLite has no row
lock, and 3.53.2 rejects the clause with `near "FOR": syntax error`; its alternative is
`BEGIN IMMEDIATE`, which is the whole database.

**A gap that outlives the transaction.** A `GET` renders an edit form, somebody goes to lunch, and
the `PUT` arrives forty minutes later in a different transaction. Row locks are released at
transaction end, long before the save turns up. What can cross that gap is data: send back the
version you read, and let the write assert it. `WHERE id = ? AND version = ?` matches nothing once
the row has moved, so a lost update arrives as a row count of 0, a conflict you can show somebody.

The last two are the pessimistic and optimistic offline lock of Patterns of Enterprise Application
Architecture. Optimistic still locks, since an `UPDATE` takes a row lock on what it modifies either
way. What optimistic declines to do is hold a lock across a human being.

The version is anything that changes on every write and travels out with the read: a counter, a row
hash, an ETag. One layer up, the same check is `If-Match`, where a mismatch is a `412`;
[conditional requests](../headers/conditional-requests-and-ranges.md) covers it.

### What to do with the conflict is a product decision

Once you hold that 0, there are three answers:

- **Refuse.** Answer `409` with what the row says now and let the person decide. This is right
  for prose a human wrote, because nothing can merge two paragraphs for them.
- **Merge**, only where the edits are separable, which in practice means per field.
  `shared-card-websocket` keeps the version at which each field last changed, so only two people on
  the same field is a conflict.
- **Last writer wins**, a legitimate answer when you say it out loud: a draft nobody else edits, a
  status a webhook owns. It is also what you get by not choosing, as an edit that disappears with a
  `200` on it.

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

Now the same interleaving with the version carried back into the write:

```sql
-- A
UPDATE documents SET body = 'draft + A', version = version + 1
  WHERE id = 42 AND version = 7;   -- UPDATE 1
-- B
UPDATE documents SET body = 'draft + B', version = version + 1
  WHERE id = 42 AND version = 7;   -- UPDATE 0
```

B now gets an answer. The handler is that row count plus one re-read:

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
caught the failed update, re-read the row and ran the write again with the version that came back,
so the retry overwrites the change that caused the conflict. Retrying is only safe where the new
value does not depend on what was read, the first case in the model. Everything else has to reach a
merge rule or a person.

**`updated_at` was the validator and a stale write went through.** A timestamp only works as a
version if it changes on every write and has the resolution to prove it. On SQLite 3.53.2,
`CURRENT_TIMESTAMP` is whole seconds, so a second save in the same second matches the first one's
`WHERE`. `datetime('now', 'subsec')` buys milliseconds, which
shrinks the window rather than closing it. In Postgres, `now()` and `CURRENT_TIMESTAMP` are the
transaction's start time and stay fixed through it, so every row one transaction touches carries the
same stamp; `clock_timestamp()` is the one that moves. A counter incremented in the `SET` clause has
neither problem.

**One row went quiet and the endpoint stopped answering for everybody who touched it.** A row lock
is held until the transaction ends, so taking one and then calling a payment provider holds it for
the length of that call, with every writer to that row queued behind it.
Nothing limits that by default. The Postgres docs say of both `lock_timeout` and
`idle_in_transaction_session_timeout` that "a value of zero (the default) disables the timeout". Set
`lock_timeout` on the transactions that take row locks, and keep anything you wait on outside them.

**The version column is there, the update looks right, and stale writes still land.** The row count
is the only signal, and it is easy to throw away. An ORM `save` reads the row, merges your object
into it and writes the difference back keyed on the primary key, so the version is not in its
`WHERE` unless the ORM was told to put it there. Find out whether what you call returns a count, the
updated row or nothing before you believe the check is running.
