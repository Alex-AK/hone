---
title: The write path
question: I saved the object and only half of it landed. What did the library decide for me?
order: 2
practise:
  - orm-save-reads-first
  - orm-save-undefined-vs-null
  - orm-relation-array-replaces-the-set
  - orm-update-skips-the-subscriber
  - orm-save-unknown-id-inserts
  - orm-nested-where-truncates-relation
  - orm-update-all-undefined
  - orm-save-many-not-insert
  - article-tags-typeorm
  - orders-report-typeorm
sources:
  - author: TypeORM
    title: Repository API
    url: https://typeorm.io/docs/working-with-entity-manager/repository-api/
  - author: TypeORM
    title: Entity Listeners and Subscribers
    url: https://typeorm.io/docs/listeners-and-subscribers
  - author: Drizzle ORM
    title: SQL Update
    url: https://orm.drizzle.team/docs/update
  - author: Martin Fowler
    title: Data Mapper
    url: https://martinfowler.com/eaaCatalog/dataMapper.html
verified: 2026-08-04
---

Reads are where the interesting queries are and writes are where the surprises are. Every statement
log on this page came from running the code against typeorm 1.1.0 and drizzle-orm 0.45.2 on
better-sqlite3 12.11.1, with the query runner wrapped so nothing could hide.

## The model

There are three different things a write can be, and they are not interchangeable.

**A statement you wrote.** `db.update(articles).set({ status }).where(eq(articles.id, id))` in
Drizzle, or `repository.update(id, { status })` in TypeORM. Nothing is read, nothing is merged, and
exactly the columns you named are set. One statement leaves your process.

**A read, a merge and a write.** TypeORM's `save` reads the row, merges what you handed it over what
it found, and writes the difference. The API docs give the merge rule in a sentence: it "also
supports partial updating since all undefined properties are skipped".

**A declaration of a set.** A relation array on `save` is not a list of things to add. It is the
state you want that relation to be in, so the library computes the join rows to insert and the join
rows to delete by comparing it against what is there.

Here are the first two, side by side, on the same change:

```
repository.update(1, { status })            repository.save({ id: 1, status })

UPDATE "articles" SET "status" = ?          SELECT id, slug, status, reviewDueAt
  WHERE "id" = 1                              FROM "articles" WHERE "id" = 1
                                            BEGIN TRANSACTION
1 statement                                 UPDATE "articles" SET "status" = ?
                                              WHERE "id" = 1
                                            COMMIT

                                            4 statements
```

Both end with the same row. What differs is that the second one knows the old value, which is what
every audit hook, cascade and `@AfterUpdate` in the codebase is built on, and it costs a round trip
to know it.

### Two empties, one NULL

JavaScript has `undefined` and `null`. SQL has `NULL`. The mapping every one of these libraries
picked is the same, and it is worth learning once: **`undefined` means "I am not talking about this
column" and `null` means "write NULL into it".** In typeorm 1.1.0, `save({ id, reviewDueAt:
undefined })` leaves `2026-06-14` where it was and `save({ id, reviewDueAt: null })` makes it null.
In drizzle-orm 0.45.2, `set({ status: 'archived', reviewDueAt: undefined })` compiles to
`set "status" = ?` and nothing else, and `set({ reviewDueAt: undefined })` alone throws
`No values to set` rather than sending an empty statement.

So clearing a column always takes a value. This is the bug that ships, because in TypeScript an
optional field is `T | undefined` and the natural way to write "clear it" hands over exactly the
thing that means "leave it".

## Worked example

The docs catalogue from `article-tags-typeorm`, which is four writes and four ways to get this
wrong. Each pair is the version that shipped and the version that works.

Recording a status change, where a subscriber keeps the change log:

```ts
await workspace.articles.update(articleId, { status }); // the change log stays empty
await workspace.articles.save({ id: articleId, status }); // one row per column that moved
```

Adding a tag to an article that already has three:

```ts
await workspace.articles.save({ id: articleId, tags: [tag] }); // now it has one

const article = await workspace.articles.findOne({
  where: { id: articleId },
  relations: { tags: true },
});
article.tags.push(tag);
await workspace.articles.save(article); // now it has four
```

Archiving, which is meant to take the article out of the review rota:

```ts
await workspace.articles.save({ id, status: 'archived', reviewDueAt: undefined }); // date survives
await workspace.articles.save({ id, status: 'archived', reviewDueAt: null }); // date cleared
```

And the read that quietly decides what the write means:

```ts
// Every article carrying `beta`, each holding only its `beta` tag.
const carrying = await workspace.articles.find({
  relations: { tags: true },
  where: { tags: { name: 'beta' } },
});
```

A nested `where` on a relation filters the relation it loads as well as the rows it matches. An
article with `beta`, `api` and `billing` comes back with `tags: ['beta']`. Filter `beta` out of that
array, hand it to `save`, and you have declared that the article has no tags at all. Run
without the nested `where` the same article comes back with all three. Load the ids with the filter,
then load the rows without it.

## Traps

**The compliance export is empty and every write succeeded.** `update` sends a bare `UPDATE` with no
read behind it, so the `afterUpdate` subscriber it wakes gets `updatedColumns: []` and no
`databaseEntity` at all, and a hook that loops over the changed columns writes nothing and throws
nothing. TypeORM's own docs warn about the same gap from the other end: "event.entity may not
necessarily contain primary key(s) when Repository.update() is used". If a hook needs the old value,
the write has to be one that read it.

**Adding one tag removed the other three.** The array is the whole set. This bites hardest when the
partial looks harmless, because `save({ id, tags: [tag] })` reads like an addition and is a
replacement. Load the current relation first and push onto it, or write the join row directly with
`createQueryBuilder().relation('tags').of(id).add(tag)`, which touches nothing else.

**Archiving it left the review date exactly where it was.** `undefined` is skipped, so the property
you set to clear the column was the one property `save` was never asked about. Use `null`. The same
sentence in the API docs that makes partial updates convenient is the one that makes this silent.

**Nothing happened and nothing complained.** `update` on an id that is no row returns
`affected: 0` and no error, so a handler that does not read that number reports success. `save` with
the same id does something different and worse: it selects, finds nothing, and inserts a row with
that id. Two methods, one typo, and one of them invents a record.

**Somebody else's edit was reverted by a save that never touched that column.** Handing `save` a
whole entity you loaded earlier writes back every column that differs from the row as it is now,
including the ones you never looked at. Load an article, let another request rename it, change only
`status` on your copy, and the statement is
`UPDATE "articles" SET "title" = ?, "status" = ? WHERE "id" = 1`: the title goes back to the value
you loaded and the rename is gone. Nothing errors, because your stale value is a perfectly good
value. Save a partial carrying only the fields the request actually changed, or take a lock, and see
[transactions and ACID](../databases/transactions-and-acid.md) for why the transaction around the
write does not help. The read is not even inside it: the order is `SELECT`, `BEGIN`, `UPDATE`,
`COMMIT`.
