---
title: Rows, or one document
question: Does this thing want rows and joins, or one document I read whole?
order: 12
practise:
  - sql-copied-column-drift
  - sql-join-author-name
  - sql-embedded-list-grows
  - sql-order-totals
  - sqlperf-count-total-cost
sources:
  - author: MongoDB
    title: Best Practices for Data Modeling in MongoDB
    url: https://www.mongodb.com/docs/manual/data-modeling/best-practices/
  - author: MongoDB
    title: Avoid Unbounded Arrays
    url: https://www.mongodb.com/docs/manual/data-modeling/design-antipatterns/unbounded-arrays/
  - author: MongoDB
    title: Transactions
    url: https://www.mongodb.com/docs/manual/core/transactions/
  - author: MongoDB
    title: Schema Validation
    url: https://www.mongodb.com/docs/manual/core/schema-validation/
  - author: Amazon Web Services
    title: NoSQL design for DynamoDB
    url: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-general-nosql-design.html
  - author: PostgreSQL
    title: JSON Types
    url: https://www.postgresql.org/docs/current/datatype-json.html
verified: 2026-08-04
---

You can store an order as rows in several tables that a query stitches back together, or as one
self-contained record you read in a single go. The two put the cost in different places. Rows make
any question easy to ask later; one record makes the page you planned for fast and the questions you
didn't plan for hard.

## The model

**A relational model starts from the entities. A document model starts from the reads.** AWS states
the inversion plainly. For a relational database you can create a normalised model without thinking
about access patterns and extend it as new questions arrive, while "you shouldn't start designing
your schema for DynamoDB until you know the questions it will need to answer". MongoDB's version is
that data accessed together should be stored together. Normalising and letting the planner assemble
the answer is correct until the shape of the answer is the thing you are choosing, which is why this
is the part people arrive unable to do.

**Embedding buys a read and charges every write that touches the copy.** MongoDB's guidance splits
the decision on the relationship, not on taste. Embed when one thing contains the other, when the
application queries the pieces together, or when they are updated or archived together. Reference
when the child side has high cardinality, grows without bounds, is written at different times in a
write-heavy workload, or can exist without a parent. Every item on both lists is about when the
bytes are read and when they are written. It is the trade [an index
makes](./what-an-index-costs.md): a faster read bought with a structure something has to maintain.
Duplicated data is write amplification by design, and the mistake is paying for it without noticing.

**The unit of atomicity is the document, and it is the sharpest test for where the boundary goes.**
In MongoDB an operation on a single document is atomic, so capturing a relationship inside one
document makes multi-document transactions unnecessary for many practical cases, and the docs say
those transactions should not replace effective schema design. So the test is what has to change
together. Things that must commit or fail as one want to be one document; things written at
different moments by different code want to be separate.

**"Schemaless" means the checking moved into your code, and nothing versioned it.** Documents in a
MongoDB collection don't need the same fields or data types, and that is the feature: MongoDB sets a
data model you can change over time against a table whose schema you must fix before inserting. You
can add validation rules to a collection, and even then they need not cover every field. There is no
`ALTER` that visits the old documents, so the shape you wrote in March is still there in December,
and only code knows how to read it. The TypeScript section keeps arriving at the same boundary, one
storage layer down.

## Worked example

One order, both ways. The document side is MongoDB's model, and the relational side, with `jsonb`
below, is Postgres. In rows, the shape is the entities and the reads are assembled:

```sql
orders(id, customer_id, placed_at, status)
order_items(id, order_id, sku, quantity, unit_price)
```

The order page is a join, the total is computed on the way out with a `SUM`, and "every order
containing this SKU" is an ordinary query nobody planned for. As a document, the shape is the order
page:

```json
{
  "_id": "o-4417",
  "placedAt": "2026-08-04T09:12:00Z",
  "customer": { "id": "c-91", "nameAtOrder": "Marta Ruiz" },
  "items": [{ "sku": "TS-01", "quantity": 2, "unitPrice": 1990 }],
  "total": 3980
}
```

One read serves the page, and three decisions are already made in it. The total is stored, because
nothing is going to recompute it on the way out. The customer's name is copied, and the field name
says which copy it is: the name as it was at the order, not a stale mirror of the customer record.
The items are embedded because an order item has no life of its own, and because they are written
once, with the order.

What it costs is the query nobody planned for. Finding every order containing `TS-01` now needs an
index into that array, a price correction rewrites the document rather than a row, and the total is
correct only for as long as the code that writes items also writes it.

Staying on Postgres doesn't avoid the question: a `jsonb` column is a document inside a row, with
the same bill. The Postgres docs say `jsonb` stores a decomposed binary format rather than the
original text, is significantly faster to process, supports indexing, and keeps neither key order
nor duplicate keys. That makes it a good home for the part of a row that really is one opaque thing,
a webhook payload or a settings blob, and a bad home for the fields you are going to filter, join
and aggregate on.

## Traps

**The embedded list with no ceiling.** Reviews inside the product, comments inside the post, events
inside the job. It reads beautifully for a year, because a page that shows ten of them costs one
read. MongoDB names this one directly: "if you do not limit the number of elements in an array, your
documents might exceed the 16MB BSON document size limit", and an unbounded array can also strain
application resources and hurt index performance. At modelling time, ask whether anything stops the
list growing, not how long it is today. If nothing does, it wants its own documents with a bounded
summary left behind.

**The copy nobody decided about.** A customer's name is denormalised onto the order to save a join,
the customer changes it, and now half the screens disagree. The bug is that nobody decided what the
copy is. Either it is the value as it was, in which case say so in the field name and it is correct
forever, or it is a cache of the current value, in which case every write that changes the original
owes a write to every copy. Both are defensible, once one of them is chosen.

**The migration that never ran.** Nothing rewrites old documents when the shape changes, so the
shape from March is still in the collection, and the reader grows a branch for it. Two years of that
and the oldest shape is the one nobody dares delete, because nobody can prove what still writes it.
Stamp a version into every document from the first day and migrate deliberately, on read or in a
job. Otherwise the schema becomes whatever the code happens to tolerate.
