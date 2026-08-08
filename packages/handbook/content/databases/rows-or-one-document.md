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

Every other page in this section asks what the database does with the query you sent it. This one is
about the decision underneath, which is what shape the data was in before any query existed. It is
not a question you avoid by staying on Postgres: a `jsonb` column is a document sitting inside a row,
and it comes with the same bill.

## The model

**A relational model starts from the entities. A document model starts from the reads.** AWS states
the inversion about as plainly as it can be stated: for a relational database "you can go ahead and
create a normalized data model without thinking about access patterns" and extend it later as new
questions arrive, while "you shouldn't start designing your schema for DynamoDB until you know the
questions it will need to answer". MongoDB's version of the same rule is that "data that's accessed
together should be stored together". The relational habit is a good habit, which is why this is the
part people arrive unable to do: normalising and letting the planner assemble an answer is correct
until the shape of the answer is the thing you are choosing.

**Embedding buys a read and charges every write that touches the copy.** MongoDB's own guidance
splits the decision on the relationship rather than on taste. Embed where there is a "has-a" or
"contains" relationship, where the application "queries pieces of information together", where the
data "is often updated together" or archived together. Reference where "the child side of the
relationship has high cardinality", where the data "grows without bounds", where the pieces are
"written at different times in a write-heavy workload", or where the child "can exist by itself
without a parent". Nothing on either list is about elegance. They are all questions about when the
bytes are read and when they are written.

That trade is the same one [an index makes](./what-an-index-costs.md): a faster read bought with a
structure something has to maintain. Duplicated data is write amplification by design, and it is the
price rather than a mistake. What makes it a mistake is paying it without noticing.

**The unit of atomicity is the document, and it is the sharpest test for where the boundary goes.**
In MongoDB "an operation on a single document is atomic", and because relationships can be captured
inside one document, "multi-document transactions are not necessary for many practical use cases".
The docs are blunt about the direction that runs in: the availability of distributed transactions
"should not be a replacement for effective schema design". So the test is not what looks tidy. It is
what has to change together. Things that must commit or fail as one want to be one document; things
written at different moments by different code want to be separate.

**"Schemaless" means the checking moved into your code, and nothing versioned it.** Documents in a
collection "don't need the same fields or data types", which is the feature: MongoDB's own
relational comparison offers "you must determine a table's schema before you insert data" against
"you can easily change your data model over time". Validation rules exist and you add them to a
collection, and even then they "don't need to cover every field in a document". What follows is
structural rather than a criticism. There is no `ALTER` that visits the old documents, so the shape
you wrote in March is still in there in December, and the only thing that knows how to read it is
code. That is the same boundary the TypeScript section keeps arriving at, one storage layer down: a
shape is a claim until something checks it.

## Worked example

One order, both ways. In rows, the shape is the entities and the reads are assembled:

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

Postgres will sell you the same shape inside a row. `jsonb` stores "a decomposed binary format"
rather than the original text, is "significantly faster to process", "supports indexing", and does
not preserve key order or duplicate keys. That makes it a genuinely good home for the part of a row
that really is one opaque thing, a webhook payload or a settings blob, and a bad home for the fields
you are going to filter, join and aggregate on.

## Traps

**The embedded list with no ceiling.** Reviews inside the product, comments inside the post, events
inside the job. It reads beautifully for a year, because a page that shows ten of them costs one
read. MongoDB names this one directly: "if you do not limit the number of elements in an array, your
documents might exceed the 16MB BSON document size limit", and "an unbounded array can strain
application resources and decrease index performance". The question at modelling time is not how long
the list is today. It is whether anything stops it growing, and if nothing does, it wants its own
documents with a bounded summary left behind.

**The copy nobody decided about.** A customer's name is denormalised onto the order to save a join,
the customer changes it, and now half the screens disagree. The copy is not the bug; the undecided
copy is. Either it is the value as it was, in which case say so in the field name and it is correct
forever, or it is a cache of the current value, in which case every write that changes the original
owes a write to every copy. Both are defensible. Neither survives being left implicit.

**The migration that never ran.** Nothing rewrites old documents when the shape changes, so the shape
from March is still in the collection, and the reader grows a branch for it. Two years of that and
the oldest shape is the one nobody dares delete, because nobody can prove what still writes it.
Stamp a version into every document from the first day and migrate deliberately, on read or in a job.
The flexibility is real, and what it costs is that "the schema" becomes whatever the code happens to
tolerate.
