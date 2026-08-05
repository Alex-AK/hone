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

Both engines are on this page. The SQLite behaviour was run against SQLite 3.53.2 through
better-sqlite3 12.11.1, the Postgres behaviour against PostgreSQL 18.3 through PGlite 0.5.4, and the
schema tooling is typeorm 1.1.0. Those statements are quoted from the runs, not recalled. drizzle-kit
is not installed here, so what it does is quoted from its documentation and marked as such.

## The model

Your schema is written down twice: once in the code, and once in the database, where it is a
side effect of every statement anyone has ever run against it. A migration is the ordered, frozen
list of steps that keeps the second one arriving at the first. Kysely puts the discipline in one
sentence: migrations "should never depend on the current code of your app because they need to work
even when the app changes. Migrations need to be 'frozen in time.'"

A generator does not know any of that. It diffs two snapshots of **structure**, and structure is
missing three things.

**Intent.** A rename and a drop-plus-add have identical before and after states. Nothing in the
diff distinguishes them, so a generator either guesses or asks. drizzle-kit asks: "based on json
differences it will prompt developer for renames if necessary". TypeORM's `synchronize` guesses, and
the comment above the guess in `RdbmsSchemaBuilder` states its own limit: "Works if only one column
per table was changed."

**Data.** No diff of two schemas mentions the rows. A column that has to be non-null needs a value
for every row that already exists, and computing that value is a statement nobody generated.
drizzle-kit's answer is an escape hatch rather than an inference: `--custom` produces an empty file
"to write your own custom SQL migrations for DDL alternations currently not supported by Drizzle Kit
or data seeding".

**Time.** A deploy is two artefacts, the schema and the code, and they land at different moments. So
every migration has a window where one has arrived and the other has not:

```
    deploy migration            deploy code
          |                          |
 old code + old schema ---> old code + new schema ---> new code + new schema
                                     ^
                          this state has to work
```

That constraint is the whole reason a rename is a bad migration and an expand-then-contract is a good
one. Add the new column, write both, backfill, switch reads, then drop the old column in a later
release. Three deploys instead of one, and no moment where the running code disagrees with the table.

SQLite has a fourth constraint that shapes the tooling on top of it. Its `ALTER TABLE` "allows these
alterations of an existing table: it can be renamed; a column can be renamed; a column can be added
to it; or a column can be dropped from it", plus setting and dropping `NOT NULL` as of 3.53.0. There
is no changing a column's type, so `ALTER TABLE t ALTER COLUMN s TYPE INTEGER` is a syntax error, and
anything an ORM cannot express in that list it does by rebuilding the whole table.

## Worked example

TypeORM's `synchronize: true` against a two-row table, renaming `nickname` to `handle`. Nothing else
changed:

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

Two columns had moved, so the heuristic gave up and the rename became a drop and an add. Same
intent, same two runs of the same tool, and the difference between keeping the data and losing it is
whether you happened to change one other thing at the same time. No error, no prompt, no warning.

Renaming two columns at once, where one of them is `NOT NULL`, at least fails loudly:
`SQLITE_CONSTRAINT_NOTNULL: NOT NULL constraint failed: temporary_people.fullName`, because the copy
step has nothing to put in the new column. Loud is the good case.

## Traps

**The migration ran clean and the column is empty.** A generated diff cannot see a rename, so it
either asks you or guesses, and a guess that is wrong is a drop and an add that reports success. The
tell is in the generated SQL: a rename is one `ALTER TABLE ... RENAME COLUMN` or one rebuild that
carries the old name across in its `SELECT`, and a drop-plus-add is two statements with no value
moving between them. Read the SQL before you run it, and where the tool offers a prompt, treat the
prompt as the point rather than as an interruption.

**It worked on the laptop and dropped a table in staging.** `synchronize: true` makes the database
match the entities on every boot, which is exactly what you want for the in-memory database a
workout or a test suite builds and exactly what nobody wants in front of real rows. TypeORM says so
itself: "it is unsafe to use `synchronize: true` for schema synchronization on production once you
get data in your database". It is one flag in a config file, and the config file is usually shared.

**Adding the column was refused, and the fix was three deploys.** Neither engine will add a `NOT
NULL` column to a table that has rows in it without a default. Postgres answers
`column "email" of relation "people" contains null values`; SQLite answers
`Cannot add a NOT NULL column with default value NULL`, which its manual states as a rule: "If a NOT
NULL constraint is specified, then the column must have a default value other than NULL." Adding it
nullable, backfilling, then adding the constraint is the shape that works, and it is three steps
because it is three different things. Watch what each step locks, too: `ALTER TABLE` in Postgres
takes an `ACCESS EXCLUSIVE` lock "unless explicitly noted", and while adding a column with a
non-volatile default is metadata-only, adding a `NOT NULL` constraint "requires scanning the table to
verify that existing rows meet the constraint". A statement that takes milliseconds on your laptop
holds an exclusive lock for the length of a scan on a table with real data in it.

**The migration had not started, and the whole API was down.** This is the one that surprises people,
because the DDL is not holding anything yet: it is queued behind somebody's long-running query, and
lock requests queue. `ACCESS EXCLUSIVE` conflicts with every other mode, including the `ACCESS SHARE`
a plain `SELECT` takes, so a reader arriving after the blocked `ALTER` waits behind the `ALTER`
rather than joining the compatible read that actually holds the table. Measured here against a real
PostgreSQL 17.10 server, because PGlite has one connection and cannot show a queue: a `SELECT
count(*)` ran fine alongside a four-second read, and the same `SELECT` sent after an `ALTER TABLE`
had queued behind that read waited until its own `lock_timeout` fired. The control is
`SET lock_timeout` before the DDL, which aborts "any statement that waits longer than the specified
amount of time while attempting to acquire a lock" with SQLSTATE `55P03`. Then the migration fails
fast and is retried, and no queue ever forms. `statement_timeout` is the wrong instrument: it bounds
the work rather than the wait, so the queue still forms and the migration is killed partway through
it.

**Adding the foreign key stopped every write to both tables.** `ADD FOREIGN KEY` is gentler than most
DDL, taking a `SHARE ROW EXCLUSIVE` lock rather than `ACCESS EXCLUSIVE`, and Postgres notes it takes
that on the referenced table too. The cost is the scan it holds that lock for, and the split is
offered in the syntax: `ADD CONSTRAINT ... NOT VALID` skips what the docs call the
"potentially-lengthy scan" while the constraint "will still be applied against subsequent inserts or
updates", and a later `VALIDATE CONSTRAINT` does the scan under a `SHARE UPDATE EXCLUSIVE` lock that
writers can work alongside. Two migrations, and the second one can wait for a quiet hour.

**The migration deployed fine and the app started throwing.** Between the two deploys, the old code
is running against the new schema. Dropping a column the running release still selects, or adding a
`NOT NULL` column the running release does not write, breaks production in the gap, and the gap can
be minutes or a rollback long. Expand, migrate, contract: every change is additive until the release
that needed it is fully out.

**Someone fixed the broken migration instead of writing a new one.** A migration that has run
somewhere is a fact about that database, and editing it changes only the databases that have not run
it yet. Every environment past that point silently diverges, and the differences show up as a
generated diff nobody can explain. Migrations run "in the alpha-numeric order of your migration
names" and are frozen once they ship; the fix for a bad one is the next one.
