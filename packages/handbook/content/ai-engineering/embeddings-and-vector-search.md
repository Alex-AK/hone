---
title: Embeddings and vector search
question: What does "the five nearest chunks" actually promise me?
order: 5
practise:
  - ai-nearest-neighbour-always-returns
  - ai-embedding-model-mismatch
sources:
  - author: pgvector
    title: pgvector
    url: https://github.com/pgvector/pgvector
verified: 2026-08-02
---

To find passages that mean roughly what a question means, you turn each piece of text into a list of
numbers that places it near similar text, then look for the pieces closest to the question. That
search always finds something closest, whether or not anything is relevant. Read it as a search
engine and you will trust answers built on passages that have nothing to do with the question.

## The model

Everything here is Postgres with pgvector, the version you can run and read the plan of.

**A vector is coordinates in one model's space.** The number of dimensions is not the meaning: two
models can both output 1,536 floats and agree on nothing, because the axes are different axes. Which
model produced a vector is part of the vector, even though nothing in the type system says so.

**A nearest-neighbour query is a sort, not a filter.** `ORDER BY embedding <=> $1 LIMIT 5` returns
the five closest rows in the table, and a sort of anything non-empty is non-empty. There is no
threshold, no notion of relevance, and no way for the index to return nothing because nothing was
close. If you want "nothing found", you write it: pgvector's own README pairs a distance predicate
with `ORDER BY` and `LIMIT`, because the predicate alone will not use the index.

**Distance comes in flavours and the index is per flavour.** pgvector gives you L2 (`<->`), cosine
distance (`<=>`), L1 (`<+>`) and inner product (`<#>`, which returns the _negative_ inner product
because Postgres only does ascending index scans). Cosine similarity is `1 - (a <=> b)`. An index is
built for one operator class, so an index on `vector_cosine_ops` does nothing for a query written
with `<->`.

**Exact is the default; approximate is a decision.** Without an index, pgvector does exact search
with perfect recall. Adding HNSW or IVFFlat buys speed by giving up recall, and the README says
plainly what that means in practice: you will see different results for the same query after adding
the index. That is not a bug report, it is the trade you took.

## Worked example

```sql
CREATE TABLE chunks (id bigserial PRIMARY KEY, doc_id int, body text, embedding vector(1536));

-- The five nearest. Always five, whatever the question was.
SELECT id, body FROM chunks ORDER BY embedding <=> $1 LIMIT 5;

-- "Nothing close enough" has to be written down. The ORDER BY and LIMIT stay,
-- because the predicate on its own cannot use the index.
SELECT id, body, 1 - (embedding <=> $1) AS similarity
FROM chunks
WHERE embedding <=> $1 < 0.35
ORDER BY embedding <=> $1
LIMIT 5;

-- Approximate search, for the distance function this query actually uses.
CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops);
```

The cutoff, `0.35` here, is not a constant you can copy. It depends on the model and the corpus, so
it is measured against real queries with known answers, which is the evals page's job.

## Traps

**Every query returns five chunks, including questions your corpus says nothing about.** The model
then answers confidently from five irrelevant chunks and it reads like a hallucination. Nothing was
broken: you asked for the nearest five and that is what a sort gives you. Add a threshold, and
accept that choosing it needs an eval set.

**You changed the embedding model and nothing errored.** Query vectors from the new model against
document vectors from the old one is valid arithmetic over meaningless coordinates, so results
degrade into noise with no exception anywhere. Treat the model as part of the index schema:
re-embed the corpus first, switch the query side second.

**You added an ANN index and the results changed.** Expected, and the README says so. What is worth
checking is the opposite case: a `WHERE` clause that filters most rows away can be served better by
an ordinary B-tree index on the filter column plus exact search than by the vector index, because
approximate indexes work on the whole table and then discard what your filter rejects.
