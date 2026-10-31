---
title: Seeing the query you did not write
question: Nothing in my code says SELECT. How do I find out what got sent, and when?
order: 3
practise:
  - orm-kysely-where-dropped
  - orm-take-not-limit
  - orm-conditional-filters
  - orm-wrong-column-typo
  - slow-list-endpoint-kysely
  - help-board-graphql
  - product-search-drizzle
  - orders-report-typeorm
sources:
  - author: Kysely
    title: Splitting build, compile and execute code
    url: https://kysely.dev/docs/recipes/splitting-query-building-and-execution
  - author: Drizzle ORM
    title: Goodies
    url: https://orm.drizzle.team/docs/goodies
  - author: TypeORM
    title: Select using Query Builder
    url: https://typeorm.io/docs/query-builder/select-query-builder/
  - author: Kysely
    title: Getting started
    url: https://kysely.dev/docs/intro
verified: 2026-08-04
---

A query builder or ORM writes the SQL for you, so the statement that reaches the database is one you
never see. When a filter goes missing or a page comes back short, the fix starts with reading that
statement. Each library will show it to you, before it runs or after, and each treats a half-built
query differently enough to cause bugs of its own.

## The model

**Every one of these libraries builds a statement in memory and hands it to a driver as a separate
step, so you can stop after the first half and read what it would send.** That answers one of two
questions that get confused with each other.

**What would this send?** Compile it. Nothing touches the database: wrapping the driver and counting
prepared statements shows zero until `execute` is called.

| Library        | Compile without running                  | Log what ran                        |
| -------------- | ---------------------------------------- | ----------------------------------- |
| kysely 0.29.4  | `.compile()` gives `{ sql, parameters }` | a `log` option on the `Kysely`      |
| drizzle 0.45.2 | `.toSQL()` gives `{ sql, params }`       | `drizzle(client, { logger: true })` |
| typeorm 1.1.0  | `.getQueryAndParameters()` on a builder  | `logging` on the `DataSource`       |

**What did it send?** That is the second column, and for a whole request it is a wrapper around the
driver rather than a switch. [N+1](../databases/n-plus-one.md) covers counting statements, which is
what that wrapper is usually for; this page is about reading them.

The part that catches people is in between. A "query" is not the same kind of object in the three
libraries, and the differences are invisible until they cost you:

```
kysely            immutable.  Every method returns a new builder. Nothing runs
                  until .execute(). The old builder is still the old query.

drizzle           mutable.    Methods return the same object, and it is thenable,
                  so awaiting it is what runs it. Awaiting it twice runs it twice.

typeorm           stateful.   One builder, two terminals: .getMany() folds rows
                  into entities, .getRawMany() hands the rows over.
```

## Worked example

The same question in all three, compiled and not run. Every output on this page came from running
the code at the versions in the table, on SQLite through better-sqlite3 12.11.1:

```ts
// kysely
db.selectFrom('products').select(['id', 'name']).where('price', '>', 150).limit(2).compile();
// sql:        select "id", "name" from "products" where "price" > ? limit ?
// parameters: [150, 2]

// drizzle
d.select().from(products).where(eq(products.price, 200)).toSQL();
// sql:    select "id", "name", "sku", "price" from "products" where "products"."price" = ?
// params: [200]

// typeorm
orders
  .createQueryBuilder('o')
  .where('o.ref = :ref', { ref: 'ORD-1' })
  .take(2)
  .getQueryAndParameters();
// ['SELECT "o"."id" AS "o_id", "o"."ref" AS "o_ref" FROM "orders" "o" WHERE "o"."ref" = ? LIMIT 2',
//  ['ORD-1']]
```

TypeORM has two spellings and they are not the same. `getQuery()` returns the statement with its
named placeholders still in it, `WHERE "o"."ref" = :ref`, which is TypeORM's own syntax and not
something a driver will take. `getQueryAndParameters()` returns the driver's form and the values
beside it, which is the pair you need if you want to run the statement yourself. That is what the
last checkpoint of `slow-list-endpoint-kysely` does with the statement out of its query log: it runs
`EXPLAIN` on the query the endpoint actually sent, because an index existing proves nothing until
the planner chooses it.

Now the two mistakes that come from the middle column of the table above. Kysely, where the builder
is immutable:

```ts
const q = db.selectFrom('products').selectAll();
q.where('price', '>', 150); // returns a new builder, and it is dropped on the floor
await q.execute(); // 3 rows, the whole table
```

Drizzle, where it is not:

```ts
const base = d.select().from(t);
base.where(eq(t.n, 1)); // base is now filtered: base === the returned builder
base.where(gt(t.n, 4)); // and now the filter is n > 4, not n = 1 and n > 4
await base; // 2 rows
```

Neither line is an error and neither library warns. Which is why the Kysely workout can hang the page
query and the count query off one `base`, and why doing that in Drizzle needs the condition to be the
shared thing rather than the query:

```ts
const where = term ? or(ilike(products.name, pattern), ilike(products.sku, pattern)) : undefined;

const items = await db.select().from(products).where(where).limit(limit).offset(offset);
const [counted] = await db.select({ total: count() }).from(products).where(where);
```

That is `product-search-drizzle`'s solution, and the reason both queries cannot drift apart is that
the filter is a value, not a half-built query.

## Traps

**The filter is right there in the code and every row came back.** In Kysely, `.where()` returns a
new builder and changes nothing about the one you called it on, so a `.where()` whose return value
is discarded is a no-op. It reads exactly like the mutating version, and the symptom is every row of
the table where you expected one.

**The count query grew the filter from the page query.** The Drizzle mirror image. `.where()` mutates
and returns the same object, so a `base` handed to two call sites is one query that both of them are
editing. Worse, a second `.where()` on the same builder replaces the first rather than joining it
with `AND`: `n = 1` followed by `n > 4` compiles to `where "t"."n" > ?` alone. Build a condition and
share that, or start a fresh chain per statement.

**One statement in the log per `await`, and the code only queries once.** A Drizzle query builder is
thenable, so `await` is what executes it, and awaiting the same object twice runs the statement
twice. Passing that object into two helpers, or logging it with `await` in the log line, doubles the
work invisibly. Kysely will not do this to you: building and executing are different calls.

**The page returned one order when the page size is two.** In typeorm 1.1.0 the paging methods are
not interchangeable, and the docs say why: "take and skip may look like we are using limit and
offset, but they aren't. limit and offset may not work as you expect once you have more complicated
queries with joins or subqueries." Measured against a `leftJoinAndSelect` over 5 orders with 3 items
each: `take(2).getMany()` sends two statements, a `SELECT DISTINCT` that pages the ids and then the
join restricted to them, and returns 2 orders. `limit(2).getMany()` puts `LIMIT 2` on the join and
returns 1 order, because both of those rows belong to the first one. And `take(2).getRawMany()`
ignores `take` completely: no `LIMIT` reaches the statement and every joined row comes back.
`take` pages objects, `limit` pages rows, and the terminal you call decides which one is even in
effect.

**The builder could not express the query, so a string went in instead.** That is the moment every
one of these libraries hands you a `sql` template or a `dataSource.query`, and it is the moment the
parameterisation stops being automatic.
[Parameterised queries](../security/parameterised-queries.md) owns that boundary, down to a CVE
against a Drizzle release one patch older than the one in the table above.
