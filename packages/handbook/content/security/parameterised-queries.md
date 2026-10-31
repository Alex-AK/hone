---
title: Parameterised queries, and what an ORM promises
question: Every value in this query is bound, so why is the ORDER BY still injectable?
order: 2
practise:
  - security-sql-injection
sources:
  - author: OWASP
    title: SQL Injection Prevention Cheat Sheet
    url: https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html
  - author: PostgreSQL
    title: 'Frontend/Backend Protocol: Message Flow'
    url: https://www.postgresql.org/docs/current/protocol-flow.html
  - author: PostgreSQL
    title: PREPARE
    url: https://www.postgresql.org/docs/current/sql-prepare.html
  - author: SQLite
    title: SQL Language Expressions
    url: https://www.sqlite.org/lang_expr.html
  - author: MySQL
    title: mysql_real_escape_string()
    url: https://dev.mysql.com/doc/c-api/8.4/en/mysql-real-escape-string.html
  - author: Drizzle ORM
    title: Magic sql operator
    url: https://orm.drizzle.team/docs/sql
  - author: Drizzle ORM
    title: Drizzle ORM has SQL injection via improperly escaped SQL identifiers
    url: https://github.com/drizzle-team/drizzle-orm/security/advisories/GHSA-gpj5-g38j-94v9
  - author: Prisma
    title: Raw queries
    url: https://www.prisma.io/docs/orm/prisma-client/using-raw-sql/raw-queries
  - author: Knex
    title: Raw
    url: https://knexjs.org/guide/raw.html
  - author: PortSwigger
    title: SQL injection
    url: https://portswigger.net/web-security/sql-injection
verified: 2026-08-02
---

SQL injection happens when text from a user ends up read as part of a database command instead of as
a value. The defence that works is to send the command and the values separately, so the database
never reads a value as code. That covers values only. Column names, table names and sort direction
cannot be sent that way, and that gap survives every ORM.

## The model

**A parameterised query is a statement and its values sent as separate things, and the statement is
parsed before any value arrives.** It is not a string with the dangerous characters taken out. The
general shape of injection is [the previous page](./untrusted-input-becomes-code.md)'s subject; this
page is about the one defence that works in SQL and the part of a query it does not cover.

Postgres makes the split visible on the wire. In its extended query protocol a Parse message carries
the query text with its placeholders, and a later Bind message carries the values. The server parses
at Parse, before it has seen a value, so by Bind the shape of the statement is settled and a value
has nowhere to go except the slot it was bound to. OWASP's consequence: the database always
distinguishes code from data, whatever the input. SQLite has no wire and gets there through its C
API: the placeholder is part of the parsed expression, and the `sqlite3_bind()` family attaches the
value afterwards.

Placeholder spelling is per-engine. SQLite takes `?`, `?NNN` for the NNN-th parameter, and the named
forms `:AAAA`, `@AAAA` and `$AAAA`. Postgres takes positional `$1`, `$2`. So a leading `$` is a
named parameter in SQLite and a positional one in Postgres.

### Escaping is this idea, implemented by hand

OWASP files escaping as strongly discouraged: fragile, and with no guarantee it prevents all SQL
injection. It breaks three ways.

**Character set.** MySQL's `mysql_real_escape_string()` escapes for the connection's character set,
and changing that with `SET NAMES` does not tell it (`mysql_set_character_set()` does). It then
escapes for one encoding while the server reads another.

**Dialect.** With the `NO_BACKSLASH_ESCAPES` mode on, the same function fails with an error, and
MySQL's reason is the sentence to keep: "the function cannot escape quote characters except by
doubling them, and to do this properly, it must know more information about the quoting context than
is available." An escaper works on a string without knowing where in the statement it will land. The
parser does know.

**No quotes to break out of.** `WHERE id = ${id}` puts the value in a numeric context, so escaping
quote characters defends nothing: `1 OR 1=1` contains no quote.

### What you cannot parameterise

A placeholder is a value slot in a statement already parsed, so anything that changes the parse
cannot be one. Prisma states the boundary for its own API: "Variables cannot be used for identifiers
such as column names, table names or database names, or for SQL keywords." OWASP names the same set,
sort direction included, and says to map the input to the legal table or column names.

Use a map, not a check. A regex like `^[a-z_]+$` admits every column that exists plus every one that
ever will. An object whose keys are the sort options and whose values are columns you typed gives
input that is not a key no route into the statement at all.

## Worked example

The endpoint from the paired problem, on SQLite, with the value bound. The same query against
Postgres reads `$1`:

```js
db.prepare('SELECT id, email FROM users WHERE email = ?').all(email);
```

Now the request grows a sort, and the value binding does nothing for it:

```js
const sort = req.query.sort; // 'email'
const dir = req.query.dir; // 'asc'

db.prepare(`SELECT id, email FROM users WHERE email = ? ORDER BY ${sort} ${dir}`).all(email);
// ?sort=id&dir=DESC%2C(SELECT%20…) and the ORDER BY clause is now yours
```

The allowlist version, in Drizzle. Both the column and the direction resolve to values written in
this file:

```ts
const SORTABLE = { email: users.email, createdAt: users.createdAt };

const column = SORTABLE[req.query.sort ?? 'createdAt'];
if (!column) throw new BadRequestException('unknown sort column');

const rows = await db
  .select()
  .from(users)
  .where(eq(users.email, email)) // bound
  .orderBy(req.query.dir === 'asc' ? asc(column) : desc(column)); // chosen, not interpolated
```

Nothing from the request is concatenated. The request picks between options; it never supplies one.

### The escape hatches, by name

Every query builder has a door out, and the door is where this bug still ships.

- **Drizzle.** The `sql` template maps each `${}` to a placeholder and passes the values separately.
  `sql.raw()`, by design, includes its string with no processing or escaping.
- **Prisma.** `$queryRaw` takes a tagged template and builds a prepared statement. `$queryRawUnsafe`
  takes a plain string, and the docs warn that user input there opens you to SQL injection.
- **Knex.** Raw bindings read `?` and `:name` as values, `??` and `:name:` as identifiers. The
  identifier forms quote what you pass. They do not check that it is a column you meant.

## Traps

**The sort order is controlled by the query string, and every value in the statement is bound.**
Placeholders cover value positions only, so the column name and `ASC`/`DESC` were interpolated even
though `email` was not. Map the request to columns and directions you wrote, and reject anything
that is not a key.

**Reaching for `sql.raw` to interpolate one table name took the parameterisation with it.**
`sql.raw()` receives a string, so JavaScript has already finished every `${}` inside it before
Drizzle sees anything. There is no template left to bind. Keep the raw fragment down to the
identifier and build the rest with `sql`, or drop the raw call and select the table from an object.

**The identifier was escaped by the library and it was still injectable.** Drizzle's
`sql.identifier()` wrapped the identifier without escaping the quote delimiter inside it, so `"` was
not doubled to `""` on Postgres, SQLite and Gel, and the backtick was not doubled on MySQL and
SingleStore. That is CVE-2026-39356, affecting drizzle-orm at or below 0.45.1 and 1.0.0-beta.19, and
fixed in 0.45.2 and 1.0.0-beta.20. The advisory's own example is dynamic sorting from
`req.query.sort`. An escaping function is code that can be wrong; an allowlist has no parser to get
wrong.

**A saved filter that worked for months dropped a table the day someone ran a report.** This is
second-order injection: input stored for later use, then read back into a query unsafely. Binding on
the way in makes the write safe and says nothing about the read. Data out of your own database is
untrusted input like any other.

**The bindings went to the wrong columns after a clause was moved.** In SQLite an anonymous `?`
takes one more than the largest parameter number already assigned, so mixing `?` and `?NNN` in one
statement hands out numbers you did not choose, and reordering the SQL reorders the values. Use one
style per statement, and prefer the named forms (`:email`) when a statement has more than two or
three parameters.

**Every query is parameterised and a user can still read another tenant's rows.** Binding decides
whether a value can become syntax. It has no opinion about which rows this account may see, and
neither does the ORM. OWASP's remaining database-side control is coarse: minimal privileges for
every database account, and no DBA or admin access for the application's. That is an account-level
grant, and it cannot express which customer owns which row. The `WHERE tenant_id = ?` is yours to
write and yours to test.
