---
title: What an ORM is actually doing
question: The join came back with six rows and the library handed me two objects. Which one is the truth?
order: 1
practise:
  - orm-aggregate-needs-raw
  - orm-group-joined-rows
  - orm-eager-ignored-by-query-builder
  - slow-list-endpoint-kysely
  - product-search-drizzle
  - orders-report-typeorm
  - article-tags-typeorm
sources:
  - author: Martin Fowler
    title: Data Mapper
    url: https://martinfowler.com/eaaCatalog/dataMapper.html
  - author: Martin Fowler
    title: Identity Map
    url: https://martinfowler.com/eaaCatalog/identityMap.html
  - author: Kysely
    title: Getting started
    url: https://kysely.dev/docs/intro
  - author: Drizzle ORM
    title: Drizzle ORM overview
    url: https://orm.drizzle.team/docs/overview
  - author: TypeORM
    title: Select using Query Builder
    url: https://typeorm.io/docs/query-builder/select-query-builder/
  - author: TypeORM
    title: Repository API
    url: https://typeorm.io/docs/working-with-entity-manager/repository-api/
verified: 2026-08-04
---

A database library sits between your code and the database, and either helps you write the query or
writes it for you. The database hands back rows, and your code wants objects, and those are not the
same shape: a join can return several rows for what your code thinks of as one thing. Knowing which
layer does that translation explains surprises like a report total counted several times over, or
an edit that never reaches the database.

## The model

**Rows and objects stop lining up the moment a parent has more than one child, and these libraries
differ in who folds one into the other.** A row is a member of a set. An object is a node in a
graph, with an identity and a lifetime. A join repeats the parent once per child, and a list of
objects does not:

```
what the database returns          what the code wants
order_id  ref      item_qty
1         ORD-1    1               ORD-1 -> [1, 2, 3]
1         ORD-1    2               ORD-2 -> [1, 2, 3]
1         ORD-1    3
2         ORD-2    1               2 objects
2         ORD-2    2
2         ORD-2    3
6 rows
```

Somebody has to do that fold. Which layer does it, and who decides what statements get sent, is what
separates the two shapes these libraries come in. The three libraries here also disagree with each
other, so each claim names one.

**A query builder types the SQL you were going to write anyway.** Kysely describes itself as a
type-safe SQL query builder, and Drizzle's tagline says that if you know SQL, you know Drizzle. One
call is one statement, the result is rows, and nothing is remembered between calls. The fold from
rows to objects is yours, which is why the Kysely workout's solution ends with a `rows.map(...)`
written by hand.

**A data mapper takes objects and works out the statements.** Fowler defines it as "A layer of
mappers that moves data between objects and a database while keeping them independent of each other
and the mapper itself." TypeORM's repositories are that layer. It folds the join rows for you, it
reads a row before writing over it, and it knows which columns moved, which is what makes
subscribers and cascades possible at all.

Neither shape is more advanced than the other. They answer different questions, and the cost of each
is the question it cannot answer: a query builder cannot tell you what changed since you loaded
something, and a data mapper will not tell you what it is about to send unless you ask it.

### The thing people assume is there and is not

Fowler's Identity Map keeps every loaded object in a map so that each one is loaded only once. That
is what makes an entity in Hibernate or Entity Framework feel like the row: read it
twice, get the same object, change a field, and a flush writes it.

TypeORM 1.1.0 does not do this. Two `findOneBy` calls for the same row hand back two different
objects, and `x === y` is `false`. There is no unit of work watching your edits either: assigning to
a property does nothing at all until you call `save`. So "entity" here means an object shaped like a
row, not a live handle on one.

### Choosing between them

Two questions decide it, and neither is about syntax. Do you want the library to decide your
statements, or to type them? And when you need a query it cannot express, what happens: Kysely and
Drizzle expect you to drop to a `sql` template and carry on in the same query, while a data mapper's
raw path usually means leaving the entity world and mapping the rows yourself. Pick on those, and on
whether the team can read a plan when the abstraction picks badly.

## Worked example

The same two orders with three line items each, asked for three ways. Every number and statement
here was produced by running it against typeorm 1.1.0, kysely 0.29.4 and drizzle-orm 0.45.2 on
SQLite through better-sqlite3 12.11.1, the versions the workouts resolve. TypeORM first, with both
of its answers to the same join:

```ts
const qb = orders.createQueryBuilder('o').leftJoinAndSelect('o.items', 'item');

await qb.getMany(); // 2 objects, each with items.length === 3
await orders
  .createQueryBuilder('o')
  .leftJoin('o.items', 'item')
  .select(['o.id AS id', 'item.qty AS qty'])
  .getRawMany(); // 6 rows
```

Running the SQL from `qb.getQueryAndParameters()` by hand returns 6 rows. `getMany` did the
fold; `getRawMany` handed the rows over untouched. Both are true, about different things.

Kysely has one answer, because it does no folding. This is the orders list from
`slow-list-endpoint-kysely`, cut down:

```ts
const rows = await db
  .selectFrom('orders')
  .innerJoin('customers', 'customers.id', 'orders.customer_id')
  .select(['orders.id as id', 'customers.name as customer_name'])
  .execute();

return rows.map((row) => ({ id: row.id, customerName: row.customer_name }));
```

The `map` is the fold, and it is four lines because the join is many-to-one. Make it one-to-many and
those four lines become a grouping pass, which is the work TypeORM's `getMany` is doing.

Drizzle sits on the same side of the line. From `product-search-drizzle`:

```ts
const items = await workspace.db
  .select()
  .from(products)
  .where(or(ilike(products.name, pattern), ilike(products.sku, pattern)))
  .orderBy(asc(products.name), asc(products.id))
  .limit(limit)
  .offset((page - 1) * limit);
```

Read it as SQL and it is SQL. On this side no statement is a surprise, and no statement is written
for you.

## Traps

**Every total on the report is multiplied by the number of line items.** `getRawMany` gives you the
join rows, so an order with 3 items appears 3 times, and summing in JavaScript triples it. Decide
which of the two you are holding before you add anything up, and prefer doing the arithmetic in SQL,
which is what `orders-report-typeorm` is about.
[What a join actually does](../sql/what-a-join-does.md) has the row arithmetic itself.

**I changed a property on the entity and nothing was written.** There is no identity map and no dirty
tracking in typeorm 1.1.0, so the object you are holding is a copy that the library has forgotten
about. Nothing reaches the database until a `save`, an `update` or a query builder call, and two
reads of one row give you two objects that can silently disagree.

**The types are green and the column does not exist.** A query builder's types come from a file you
wrote, not from the database. A Kysely `Database` interface declaring `products.archived_at` against
a table that has only `id` and `name` type-checks clean under `tsc --strict` and fails at runtime
with `no such column: "archived_at"`. Drizzle reads the same schema file its migrations are
generated from, which narrows the gap without closing it: the deployed database is still a separate
artefact, and green types only mean your code agrees with your schema file.

**We swapped the ORM and the endpoint is still slow.** The library chooses the statements; it does
not choose the access pattern, and the access pattern is what costs you. A loop that touches a
relation is N+1 in all three, an unindexed filter is a table scan in all three, and none of them
turns 40,000 rows into a page. [N+1](../databases/n-plus-one.md) and
[reading EXPLAIN](../databases/reading-explain.md) are the same skills whichever one you picked.
