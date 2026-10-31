---
title: Migrations, and what a generated diff cannot see
question: The generated migration ran clean and the column came out empty. What did it not know?
order: 4
practise:
  - orm-not-null-on-a-full-table
  - orm-rename-is-a-drop-and-an-add
  - orm-ddl-lock-queue
  - orm-add-foreign-key-scan
  - orm-expand-then-contract
  - orders-migration-postgres
  - slow-list-endpoint-kysely
sources:
  - author: TypeORM
    title: 'Migrations: why migrations'
    url: https://typeorm.io/docs/migrations/why
  - author: Drizzle ORM
    title: drizzle-kit generate
    url: https://orm.drizzle.team/docs/drizzle-kit-generate
  - author: Kysely
    title: Migrations
    url: https://kysely.dev/docs/migrations
  - author: PostgreSQL
    title: ALTER TABLE
    url: https://www.postgresql.org/docs/current/sql-altertable.html
  - author: PostgreSQL
    title: Explicit Locking
    url: https://www.postgresql.org/docs/current/explicit-locking.html
  - author: PostgreSQL
    title: Client Connection Defaults
    url: https://www.postgresql.org/docs/current/runtime-config-client.html
  - author: SQLite
    title: ALTER TABLE
    url: https://www.sqlite.org/lang_altertable.html
verified: 2026-08-04
---

A migration is a script that changes the database's structure to match what your code now expects.
Tools can write one for you by comparing the old schema with the new. That comparison sees only the
shape of the tables, so a migration that runs without an error can still lose data, lock a busy
table, or break the code still running mid-deploy.

## The model

**A generator diffs two snapshots of structure, and structure is missing three things: intent, data
and time.** Your schema is written down twice: in the code, and in the database as a side effect of
every statement ever run against it. A migration is the ordered, frozen list of steps that
keeps the second arriving at the first.

**Intent.** A rename and a drop-plus-add have identical before and after states, so a generator
either guesses or asks. drizzle-kit's docs say it prompts for renames where needed. TypeORM's
`synchronize` guesses, and the comment above the guess in `RdbmsSchemaBuilder` states its own limit:
"Works if only one column per table was changed."

**Data.** No diff of two schemas mentions the rows. A column that has to be non-null needs a value
for every row that already exists, and computing that value is a statement nobody generated.

**Time.** The schema and the code deploy at different moments, so every migration has a window where
one has arrived and the other has not:

```
    deploy migration            deploy code
          |                          |
 old code + old schema ---> old code + new schema ---> new code + new schema
                                     ^
                          this state has to work
```

That window is why a rename is a bad migration and expand-then-contract is a good one. Add the new
column, write both, backfill, switch reads, then drop the old column in a later release. Three
deploys instead of one, and the running code never disagrees with the table.

**SQLite adds a fourth constraint.** Its `ALTER TABLE` can rename a table, and rename, add or drop a
column, plus set and drop `NOT NULL` as of 3.53.0. It cannot change a column's type, so anything an
ORM cannot express in that list it does by rebuilding the table.

## Worked example

This is SQLite 3.53.2 through better-sqlite3 12.11.1, with typeorm 1.1.0's `synchronize: true`
against a two-row table, renaming `nickname` to `handle`. Nothing else changed:

```
[schema] renaming column "nickname" in "people" to "handle"
CREATE TABLE "temporary_people" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                                 "name" text NOT NULL, "handle" text)
INSERT INTO "temporary_people"("id", "name", "handle") SELECT "id", "name", "nickname" FROM "people"
DROP TABLE "people"
ALTER TABLE "temporary_people" RENAME TO "people"

rows after: [{ id: 1, name: 'Ana', handle: 'A' }]
```

The guess was right, and the rebuild carried the data across in the `SELECT`. Now the same rename,
with one unrelated new column added in the same step:

```
[schema] columns dropped in people: nickname
CREATE TABLE "temporary_people" (... "name" text NOT NULL)          -- no nickname, no handle
INSERT INTO "temporary_people"("id", "name") SELECT "id", "name" FROM "people"
DROP TABLE "people"
ALTER TABLE "temporary_people" RENAME TO "people"

[schema] new columns added: handle, email
CREATE TABLE "temporary_people" (... "handle" text, "email" text)
INSERT INTO "temporary_people"("id", "name") SELECT "id", "name" FROM "people"
DROP TABLE "people"
ALTER TABLE "temporary_people" RENAME TO "people"

rows after: [{ id: 1, name: 'Ana', handle: null, email: null }]
```

Two columns had moved, so the heuristic gave up and the rename became a drop and an add, with no
error, no prompt and no warning. Whether you keep the data depends on whether you happened to change
one other thing at the same time.

## Traps

**The migration ran clean and the column is empty.** The rename was guessed as a drop and an add.
The tell is in the generated SQL: a rename is one `ALTER TABLE ... RENAME COLUMN` or one rebuild
that carries the old name across in its `SELECT`, and a drop-plus-add is two statements with no
value moving between them. Read the SQL before you run it, and read any prompt the tool shows.

**It worked on the laptop and dropped a table in staging.** `synchronize: true` makes the database
match the entities on every boot, which is right for the in-memory database a workout or a test
suite builds and wrong in front of real rows. TypeORM says so itself: "it is unsafe to use
`synchronize: true` for schema synchronization on production once you get data in your database".
It is one flag, in a config file that is usually shared.

**Adding the column was refused, and the fix was three deploys.** Neither engine will add a
`NOT NULL` column without a default to a table that has rows. PostgreSQL 18.3, run through PGlite
0.5.4, answers `column "email" of relation "people" contains null values`; SQLite answers
`Cannot add a NOT NULL column with default value NULL`. Add it nullable, backfill, then add the
constraint: three steps because it is three different things. Per the Postgres docs, adding a column
with a non-volatile default is metadata-only, but adding a `NOT NULL` constraint holds an
`ACCESS EXCLUSIVE` lock while it scans the existing rows.

**The migration had not started, and the API was down.** The `ALTER` holds nothing yet: it is
queued behind somebody's long-running query, and lock requests queue. `ACCESS EXCLUSIVE` conflicts
with every other mode, including the `ACCESS SHARE` a plain `SELECT` takes, so a reader arriving
after the blocked `ALTER` waits behind it instead of joining the read that holds the table. On a
real PostgreSQL 17.10 server, a `SELECT` that ran fine alongside a long read waited until its own
`lock_timeout` fired once an `ALTER TABLE` had queued behind that read. Set `lock_timeout` before
the DDL, so the migration gives up waiting fast, is retried, and no queue forms. `statement_timeout`
bounds the work rather than the wait, so the queue still forms and the migration is killed partway
through.

**Adding the foreign key stopped every write to both tables.** `ADD FOREIGN KEY` takes a `SHARE ROW
EXCLUSIVE` lock on both tables and holds it for a scan. `ADD CONSTRAINT ... NOT VALID` skips the
scan but still checks later inserts and updates, and a later `VALIDATE CONSTRAINT` scans under a
`SHARE UPDATE EXCLUSIVE` lock that writers can work alongside. Two migrations, and the second one
can wait for a quiet hour.

**The migration deployed fine and the app started throwing.** Between the two deploys, old code runs
against the new schema, so dropping a column it still selects, or adding a `NOT NULL` column it does
not write, breaks production for minutes or a rollback. Expand, migrate, contract: every change
stays additive until the release that needed it is fully out.

**Someone fixed the broken migration instead of writing a new one.** A migration that has run
somewhere is a fact about that database, and editing it changes only the databases that have not run
it yet. Every environment past that point silently diverges, and it surfaces as a generated diff
nobody can explain. Kysely runs migrations in the alphanumeric order of their names, and they are
frozen once they ship: the fix for a bad one is the next one.
