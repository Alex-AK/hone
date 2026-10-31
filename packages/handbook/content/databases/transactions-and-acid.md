---
title: Transactions and ACID
question: The whole handler is wrapped in a transaction. What can still go wrong?
order: 8
practise:
  - sql-optimistic-update-zero-rows
  - sql-serializable-needs-retry
  - approval-log-sqlite
  - class-places-sqlite
  - depot-scan-sqlite
  - idempotent-payments-express
  - sys-idempotency
  - debug-fire-and-forget-work
  - sys-replica-lag
sources:
  - author: PostgreSQL
    title: Transaction Isolation
    url: https://www.postgresql.org/docs/current/transaction-iso.html
  - author: SQLite
    title: Isolation In SQLite
    url: https://www.sqlite.org/isolation.html
  - author: SQLite
    title: BEGIN TRANSACTION
    url: https://www.sqlite.org/lang_transaction.html
  - author: SQLite
    title: PRAGMA Statements
    url: https://www.sqlite.org/pragma.html
  - author: SQLite
    title: SQLite Is Transactional
    url: https://www.sqlite.org/transactional.html
verified: 2026-08-02
---

A transaction groups several database writes so they all land or none do. That promise is narrower
than it sounds: it says nothing about a card charge made from inside it, it does not stop two
requests working from the same stale read, and whether a commit survives a power cut depends on
settings.

## The model

**ACID is four separate promises, and reading them as one word is how people end up trusting a
transaction with work it never covered.** This page puts Postgres and SQLite side by side, with the
Postgres behaviour taken from the PostgreSQL 18 documentation.

- **Atomicity** — may I assume all of these statements landed or none did? Yes, for statements
  against this database in this transaction, with no configuration. SQLite's manual says that holds
  even when a crash or power failure interrupts the write to disk.
- **Consistency** — may I assume the data satisfies my rules at the end? Only the rules you declared
  to the database and turned on.
- **Isolation** — how much of another transaction in flight may I see? This one has a dial, and the
  dial has a price in failed transactions.
- **Durability** — may I assume a committed transaction survives? That depends on settings.

**Isolation levels are named after the anomalies they forbid.** In the order they stop being
possible: a dirty read sees another transaction's uncommitted write, a non-repeatable read gets two
values from one row read twice, a phantom read gets a different set of rows from one query run
twice, and a serialization anomaly is a result from transactions that are each correct alone but
together match no serial order. Serializable forbids all four.

Postgres defaults to Read Committed, and accepts all four level names but implements three: its Read
Uncommitted behaves like Read Committed, and its Repeatable Read is snapshot isolation, which
forbids phantoms too. At Repeatable Read and Serializable, Postgres aborts the conflicting
transaction with a `could not serialize access` error, and the docs say of both that "applications
using this level must be prepared to retry transactions due to serialization failures".

**SQLite has no dial.** It runs one writer at a time, and its docs say it gets serializable
isolation by actually serializing the writes. In WAL mode a reader holds a snapshot from when its
read transaction started while writers append alongside it. Shared cache plus `PRAGMA
read_uncommitted` is the only way one connection sees another's uncommitted work.

## Worked example

Run on SQLite 3.53.2: two connections to the same file in WAL mode, `B` opening a plain `BEGIN`,
which is `DEFERRED`:

```sql
-- B
BEGIN;                            -- no lock yet, nothing has started
SELECT n FROM t WHERE id = 1;     -- 10; the read transaction and its snapshot start here

-- A, on another connection, meanwhile
BEGIN IMMEDIATE;
UPDATE t SET n = 99 WHERE id = 1;
COMMIT;                           -- succeeds

-- B again
SELECT n FROM t WHERE id = 1;     -- still 10, which is the snapshot doing its job
UPDATE t SET n = 100 WHERE id = 1;
-- Error: SQLITE_BUSY_SNAPSHOT, database is locked
```

`B` fixed its view at its first `SELECT`, so it cannot write on top of a version it has not seen,
and SQLite refuses rather than lose `A`'s commit. Per the manual, that first `SELECT` started a read
transaction, and a later write upgrades it if possible or returns `SQLITE_BUSY`. `BEGIN IMMEDIATE`
takes the write lock up front, so a transaction that will write fails at the start, where a retry is
cheap, instead of after the reads.

What isolation does not give you is the same on either engine:

```ts
// Two of these running at once lose one of the decrements at Read Committed,
// which is the Postgres default, transaction or no transaction.
const { balance } = read('SELECT balance FROM accounts WHERE id = ?', id);
write('UPDATE accounts SET balance = ? WHERE id = ?', balance - 10, id);

// One statement. The database re-reads the row it is about to write.
write('UPDATE accounts SET balance = balance - 10 WHERE id = ?', id);
```

The first pair writes down a number computed in your process from a row that has since moved on,
and nothing in the transaction claims the row is still what you read. The second is safe at Read
Committed because Postgres re-evaluates the `WHERE` clause against the updated row before writing.
To keep the read-then-decide shape, lock the row with `SELECT ... FOR UPDATE`, which returns and
locks the updated version. SQLite rejects that clause as a syntax error; its equivalent is
`BEGIN IMMEDIATE` around the pair, which locks the whole database rather than one row.

## Traps

**Half the batch is in the database and the job reported an error.** SQLite does not abort a
transaction when one statement fails: its manual says it undoes just that statement, keeps the
earlier changes, and carries on. On SQLite 3.53.2, three inserts inside one `BEGIN` where the middle
one violates a `CHECK` leave rows 1 and 3 committed. Postgres does the opposite, answering every
later statement with `current transaction is aborted` until you end the block; a `SAVEPOINT` before
the risky statement and `ROLLBACK TO SAVEPOINT` after it is how you carry on. The same driver code
ships against both, so decide whether your error handler rolls back.

**Rows point at a customer that does not exist, and nothing complained.** SQLite ships with foreign
key enforcement off, per connection rather than per file: `PRAGMA foreign_keys` answers `0` on
`practice.db` and on a fresh database. An order with `customer_id = 99999` inserts into a copy of
`practice.db`; after `PRAGMA foreign_keys = ON` the same insert fails with `FOREIGN KEY constraint
failed`. The manual says not to depend on the default, so check that your pool sets it on every
connection, not only the first.

**The transaction committed and the customer was charged twice.** A transaction covers writes to
that database and nothing else. A card charge, an email, a webhook or a queue publish is outside it,
so a rollback leaves it done and a retry does it again. The answer is a key the caller repeats plus
a row recording what you already did, which `idempotent-payments-express` builds end to end.

**Raising the isolation level turned a data bug into intermittent 500s.** Postgres at Repeatable
Read and Serializable aborts a conflicting transaction, so the level is half the change. The other
half is a retry that reruns the whole transaction, not the failed statement. That is only safe if
the transaction is a pure function of its inputs, so any external effect (see the previous trap) has
to come out first.

**Committed, and then gone after a power cut.** Durability is a setting. The SQLite manual is blunt
about the popular combination: "WAL mode does lose durability. A transaction committed in WAL mode
with synchronous=NORMAL might roll back following a power loss or system crash." A crash of your
application alone never loses a commit, whatever you set, so this is a deliberate trade rather than
a bug, and `synchronous = FULL` buys power-loss durability back.
A read routed to a follower can miss a write the leader has already committed: that is
[replication](../systems/replication.md).
