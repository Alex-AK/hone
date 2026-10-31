---
title: Search, past LIKE
question: The search box misses rows that plainly contain the word. What should be doing this instead of LIKE?
order: 7
practise:
  - sql-search-stemmed-lexemes
  - sql-search-tsvector-tsquery
  - sql-search-rank-vs-match
  - sql-search-gin-index
  - sql-search-trigram
  - product-search-drizzle
sources:
  - author: PostgreSQL
    title: 'Full Text Search: Introduction'
    url: https://www.postgresql.org/docs/current/textsearch-intro.html
  - author: PostgreSQL
    title: GiST and GIN Index Types
    url: https://www.postgresql.org/docs/current/textsearch-indexes.html
  - author: PostgreSQL
    title: pg_trgm
    url: https://www.postgresql.org/docs/current/pgtrgm.html
  - author: SQLite
    title: SQLite FTS5 Extension
    url: https://www.sqlite.org/fts5.html
verified: 2026-08-02
---

A plain text search looks for the exact letters you typed, so it misses a row that uses the word in
another form, and it has to read every row to do it. Databases have better tools for this. They
break text into normalised words, or into short slices of letters, and index those, which lets a
search for one form of a word find the others, or survive a typo, without reading the whole table.

## The model

Every output here came from PGlite 0.5.4, which is PostgreSQL 18.3. A full-text index does not hold
your text. `to_tsvector` reduces a document to lexemes: case folded, stemmed to a root, stop words
dropped, each carrying the positions it appeared at.

```sql
SELECT to_tsvector('english', 'She runs every morning before work');
-- 'everi':3 'morn':4 'run':2 'work':6
```

Six words in, four lexemes out. Postgres draws the line as "tokens are raw fragments of the document
text, while lexemes are words that are believed useful for indexing and searching", and both of the
surprises follow from it. The query is reduced the same way, so `plainto_tsquery('english', 'running')`
is `'run'` too and finds the row that said `runs`. And `plainto_tsquery('english', 'the')` is the empty
query, so searching for a stop word matches nothing at all.

`tsvector` is the document side; `tsquery` is the question side, containing "search terms, which must
be already-normalized lexemes"; `@@` matches one against the other and is undefined for two of the
same type. **Matching and ranking are separate decisions:** `@@` returns a boolean, so every row that
passed passed identically, and `ts_rank` is what scores the survivors for an `ORDER BY`.

GIN is the index you build for it, and the way it fails is instructive. `CREATE INDEX` defaults to a
B-tree and `tsvector` has a B-tree operator class, so an index over `to_tsvector(...)` is created
without complaint and never chosen. Postgres calls GIN "the preferred text search index type".

Trigrams answer what full text cannot: a typo, and a fragment from the middle of a string. `pg_trgm`
stores every overlapping three-character slice, `show_trgm('receive')` being
`{"  r"," re",cei,ece,eiv,ive,rec,"ve "}`, so the question becomes which rows hold those slices and
there is no descent for a leading `%` to defeat, unlike in
[a B-tree](../data-structures/the-tree-under-an-index.md). `similarity('recieve', 'receive')` is
0.33333334, over the default `pg_trgm.similarity_threshold` of 0.3, so `'recieve' % 'receive'` is true.

SQLite arrives by another door. FTS5 is a virtual table you write alongside the real one and query with
`MATCH`, not an index on a column. Stemming is opt-in, through a `tokenize = porter` wrapper that
"applies the porter stemming algorithm to each token", and `tokenize = trigram` is what makes `LIKE`
and `GLOB` indexed.

[How an index gets used](./how-an-index-gets-used.md) ends a trap by saying a `%term%` search wants
a trigram or a full-text index, and this is what each one is. `LIKE` itself, wildcards and `ESCAPE`
included, belongs to [the shape of a SELECT](../sql/the-shape-of-a-select.md).

## Worked example

20,003 rows in `docs`: three mention running in some form, and 20,000 are filler.

```sql
SELECT id, ts_rank(to_tsvector('english', body), plainto_tsquery('english', 'running')) AS rank
FROM docs
WHERE to_tsvector('english', body) @@ plainto_tsquery('english', 'running')
ORDER BY rank DESC;
-- id 2 | 0.08654518     id 1 | 0.06079271     id 3 | 0.06079271
```

Row 2 holds `run` four times and outranks rows 1 and 3, which tie exactly. `@@` passed all three
equally and had no opinion about that order. Unindexed, the filter builds a `tsvector` for every row,
which [the plan](./reading-explain.md) shows:

```
Seq Scan on docs  (cost=0.00..5488.79 rows=100 width=4) (actual time=0.034..115.683 rows=3.00 loops=1)
  Filter: (to_tsvector('english'::regconfig, body) @@ '''run'''::tsquery)
  Rows Removed by Filter: 20000
Execution Time: 115.756 ms
```

`CREATE INDEX docs_body_btree ON docs (to_tsvector('english', body))` succeeds and changes nothing:
the same `Seq Scan`, at the same `cost=0.00..5488.79`. Adding `USING GIN` to that statement does:

```
Bitmap Heap Scan on docs  (cost=13.35..224.56 rows=100 width=4) (actual time=0.381..0.384 rows=3.00 loops=1)
  ->  Bitmap Index Scan on docs_body_gin  (cost=0.00..13.33 rows=100 width=0) (actual time=0.371..0.371 rows=3.00 loops=1)
        Index Cond: (to_tsvector('english'::regconfig, body) @@ '''run'''::tsquery)
Execution Time: 0.443 ms
```

The useless B-tree is still sitting there afterwards, at 2616 kB against the GIN index's 1296 kB.

## Traps

**Searching for a common word returns nothing at all.** The English configuration treats it as a stop
word, so `plainto_tsquery` reduces the whole query to the empty `tsquery`, which matches no document.
Nothing errors and the plan looks healthy. Test the parsed query against `''::tsquery` before you run
the search, and tell the user their term was dropped.

**The GIN index exists and the plan still says `Seq Scan`.** The predicate has to match the indexed
expression, not merely mean the same thing: against an index on `to_tsvector('english', body)`, a query
written `to_tsvector(body) @@ plainto_tsquery('running')` scans, though `default_text_search_config` is
`pg_catalog.english` and both calls return an identical vector. Name the configuration in both places.

**The right rows come back in table order.** `@@` is a filter, so 4,000 matches are equally matched and
the first page is whichever ones the heap produced first. Add `ORDER BY ts_rank(...) DESC` and a
`LIMIT`, ranking the survivors of the filter rather than the table.

**Search finds "running" but not "Running Shoes Ltd".** The two sides were normalised differently.
`to_tsvector('simple', 'Running Shoes Ltd')` is `'ltd':3 'running':1 'shoes':2`, which
`plainto_tsquery('english', 'running')` does not match, because the query stemmed to `'run'` and that
stored lexeme never did. Write one configuration explicitly in the column expression, the index and the
query, and reindex when you change it.
