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

Both engines are on this page. The Postgres statements are quoted from the PostgreSQL 18
documentation. Every SQLite behaviour below was produced by running it, against SQLite 3.53.2 through
better-sqlite3 or the `sqlite3` shell, on `practice.db` or a copy of it.

## The model

ACID is four separate promises, and reading them as one word is how people end up trusting a
transaction with work it never covered. Take each as a question about what your code may assume.

- **Atomicity** — may I assume that either all of these statements landed or none of them did? Yes,
  for statements against this database, in this transaction, and SQLite claims it right through a
  crash: changes "either occur completely or not at all, even if the act of writing the change out to
  the disk is interrupted by a program crash, an operating system crash, or a power failure". That is
  the promise most people mean by "transaction", and the one that holds without configuration.
- **Consistency** — may I assume the data satisfies my rules at the end? Only the rules you declared
  to the database and turned on. A foreign key it is not enforcing is not a rule it will keep.
- **Isolation** — how much of another transaction in flight am I allowed to see? This is the one with
  a dial on it, and the dial has a price in failed transactions.
- **Durability** — may I assume that once `COMMIT` returned, the data survives? Depends on settings
  you may not have chosen deliberately.

Isolation is the half worth learning properly, because the levels are named after what they forbid,
not after what they do. Four anomalies, in the order they stop being possible:

- **Dirty read** — you see a row another transaction has written and not committed.
- **Non-repeatable read** — you read one row twice in one transaction and get two different values.
- **Phantom read** — you run one query twice in one transaction and get a different set of rows.
- **Serialization anomaly** — every transaction is correct on its own, and the result of running them
  together matches no serial order of them.

The SQL standard defines each level as the anomalies it permits. Postgres accepts all four names and
implements three of them: its Read Uncommitted "behaves like Read Committed", and its Repeatable Read
does not allow phantom reads either, because it is snapshot isolation and gives a stronger guarantee
than the level requires. Nothing tells you when you asked for a level the engine does not implement:
`SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED` followed by `SHOW transaction_isolation` answers
`read uncommitted` on PostgreSQL 18.3, while the behaviour is Read Committed.

| Level                       | Dirty read | Non-repeatable | Phantom   | Serialization anomaly |
| --------------------------- | ---------- | -------------- | --------- | --------------------- |
| Read uncommitted            | not in PG  | possible       | possible  | possible              |
| Read committed (PG default) | no         | possible       | possible  | possible              |
| Repeatable read             | no         | no             | not in PG | possible              |
| Serializable                | no         | no             | no        | no                    |

Going up the table does not make concurrency go away. It changes how the database tells you about it.
At Repeatable Read, Postgres aborts with `could not serialize access due to concurrent update`; at
Serializable, with `could not serialize access due to read/write dependencies among transactions`.
The docs say the same thing about both levels: "applications using this level must be prepared to
retry transactions due to serialization failures". Raising the level without writing the retry loop
converts a rare wrong answer into a rare 500.

SQLite has no dial. It runs one writer at a time and gets serializable isolation out of that:
"SQLite implements serializable transactions by actually serializing the writes." In WAL mode a
reader holds a snapshot of the database as it was when its read transaction started, and writers
append alongside it. The exception is narrow and you will not hit it by accident: shared cache plus
`PRAGMA read_uncommitted` is the only way one connection sees another's uncommitted work.

## Worked example

Isolation is the thing you can watch on a laptop. Two connections to the same SQLite file in WAL
mode, `B` opening a plain `BEGIN`, which is `DEFERRED`:

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

Read the failure as the guarantee, not the bug. `B` decided what the database looked like at its
first `SELECT`, so it cannot write on top of a version it has not seen, and SQLite refuses rather
than lose `A`'s commit. The manual is explicit about how the deferred transaction got there:
"If the first statement after BEGIN DEFERRED is a SELECT, then a read transaction is started.
Subsequent write statements will upgrade the transaction to a write transaction if possible, or
return SQLITE_BUSY." `BEGIN IMMEDIATE` takes the write lock up front, so a transaction that is going
to write fails at the start, where a retry is cheap, instead of after the reads.

The other half is what isolation does not give you, and it does not depend on the engine:

```ts
// Two of these running at once lose one of the decrements at Read Committed,
// which is the Postgres default, transaction or no transaction.
const { balance } = read('SELECT balance FROM accounts WHERE id = ?', id);
write('UPDATE accounts SET balance = ? WHERE id = ?', balance - 10, id);

// One statement. The database re-reads the row it is about to write.
write('UPDATE accounts SET balance = balance - 10 WHERE id = ?', id);
```

The first pair computed a number in your process from a row that has since moved on, and then wrote
that number down. Nothing in the transaction contradicts it, because nothing in it is a claim about
the row still being what you read. The second is safe at Read Committed because Postgres re-checks
the row at write time: "The search condition of the command (the `WHERE` clause) is re-evaluated to
see if the updated version of the row still matches the search condition." To keep the
read-then-decide shape, lock the row you read with `SELECT ... FOR UPDATE`, which returns and locks
the updated version. SQLite has no such clause, and rejects it as a syntax error; the equivalent is
`BEGIN IMMEDIATE` around the pair, which is the whole database rather than one row.

## Traps

**Half the batch is in the database and the job reported an error.** SQLite does not abort a
transaction when one statement fails: it "attempts to undo just the one statement it was working on
and leave changes from prior statements within the same transaction intact and continue with the
transaction". Three inserts inside one `BEGIN` where the middle one violates a `CHECK` leave rows 1
and 3 committed. Postgres does the opposite, and every later statement answers
`current transaction is aborted, commands ignored until end of transaction block` until you end the
block; a `SAVEPOINT` before the risky statement and a `ROLLBACK TO SAVEPOINT` after it is how you
carry on. The same driver code ships against both, so decide whether your error handler rolls back
rather than inheriting whatever the engine does.

**Rows point at a customer that does not exist, and nothing complained.** SQLite ships with foreign
key enforcement off: `PRAGMA foreign_keys` answers `0` on `practice.db` and on a freshly created
database, and it is a per-connection setting, not a property of the file. Inserting an order with
`customer_id = 99999` into a copy of `practice.db` is accepted; the same insert after
`PRAGMA foreign_keys = ON` fails with `FOREIGN KEY constraint failed`. `CHECK` constraints are
enforced either way. The manual asks you to be explicit: "applications should set the foreign key
enforcement flag as required by the application and not depend on the default setting." The C in ACID
means the constraints you declared, and it is worth checking that your connection pool sets the
pragma on every connection rather than on the first one.

**The transaction committed and the customer was charged twice.** A transaction covers writes to that
database and nothing else. A card charge, an email, a webhook, a queue publish and a write to a
second service are all outside it, so a rollback leaves them done and a retry does them again.
`idempotent-payments-express` is that shape end to end: the gateway is "a call over the network that
moves real money and cannot be rolled back by a transaction of yours", and the answer is a key the
caller repeats plus a row recording what you already did. `debug-fire-and-forget-work` puts the same
boundary at the other end of a request.

**Raising the isolation level turned a data bug into intermittent 500s.** Repeatable Read and
Serializable in Postgres abort a conflicting transaction rather than letting it through, which means
the level is only half the change; the other half is a retry that reruns the whole transaction, not
the failed statement. Retrying is only safe if the transaction is a pure function of its inputs, so
any external effect inside it (see the previous trap) has to come out first.

**Committed, and then gone after a power cut.** Durability is a setting. The SQLite manual is blunt
about the popular combination: "WAL mode does lose durability. A transaction committed in WAL mode
with synchronous=NORMAL might roll back following a power loss or system crash." Transactions stay
durable across application crashes whatever you set, and atomicity and isolation are unaffected, so
this is a deliberate trade rather than a bug, and `synchronous = FULL` is what buys it back. A
committed row is also not a visible row everywhere: a read routed to a follower can miss a write the
leader has already committed, which is [replication](../systems/replication.md), not the
transaction's failure.
