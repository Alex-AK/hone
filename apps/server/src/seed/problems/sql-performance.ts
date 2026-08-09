import { code, md, type ProblemDraft, sqlProblem } from './types';

/**
 * Reading a query plan, and the rewrites that change one. Index *design* already
 * belongs to the six `sql-index-*` reps in sql.ts, so nothing here asks what to
 * create: these reps ask what the planner says it did, and what you can do about
 * it without adding an index at all.
 *
 * Every plan quoted in a prompt is verbatim CLI output, produced by running the
 * query rather than remembered. The command that produced it sits in a comment
 * directly above the rep, so when an engine update changes a plan the plan is
 * regenerated instead of trusted. Engine: SQLite 3.51.0. Dataset: the bookstore
 * in practice-data.ts, as built into apps/server/data/practice.db.
 *
 * practice.db carries no secondary indexes, so the plans that need one are captured
 * against a throwaway copy. Those comments carry the `CREATE INDEX` statements, and
 * nothing here ever writes to practice.db itself.
 */
export const sqlPerformanceProblems: ProblemDraft[] = [
  // Captured:
  //   sqlite3 apps/server/data/practice.db \
  //     "EXPLAIN QUERY PLAN SELECT id, book_id, quantity FROM order_items WHERE order_id = 5;"
  //   sqlite3 apps/server/data/practice.db \
  //     "EXPLAIN QUERY PLAN SELECT id, book_id, quantity FROM order_items WHERE id = 5;"
  {
    slug: 'sqlperf-plan-scan-vs-search',
    title: 'The first word of a query plan',
    category: 'sql-performance',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'short-text',
    prompt: md(
      'Two lookups against `order_items`, which holds 40 rows. Same shape, one column different, one row back from each.',
      '',
      code('sql', 'SELECT id, book_id, quantity FROM order_items WHERE order_id = 5;'),
      code('text', 'QUERY PLAN', '`--SCAN order_items'),
      '',
      code('sql', 'SELECT id, book_id, quantity FROM order_items WHERE id = 5;'),
      code('text', 'QUERY PLAN', '`--SEARCH order_items USING INTEGER PRIMARY KEY (rowid=?)'),
      '',
      'In one line: what does `SCAN order_items` say the first query did?'
    ),
    graderConfig: {
      accept: [
        'it reads every row',
        'reads every row',
        'it reads every row of the table',
        'every row in the table',
        'a full table scan',
        'full table scan',
        'it reads the whole table',
        'it reads all 40 rows',
      ],
      acceptPatterns: [
        'every row',
        'all (the |40 )?rows',
        'each row',
        'whole table',
        'entire table',
        'full (table )?scan',
        '(sequential|seq)\\.? ?scan',
        '\\btable scan',
        '\\bscans? the table',
        '\\breads? the (whole |entire )?table',
      ],
      nearMisses: {
        'it uses no index':
          'True, and it is the cause rather than the reading. `SCAN` names the work done to the table.',
        'it is slower': 'On a big table, yes. Say what it is doing that costs the time.',
        'it searches the table':
          'SQLite prints `SEARCH` for that, and it means the opposite: straight to the row, no detour.',
        'it scans the index':
          'Nothing is indexed on `order_id`. The scan is over the table itself.',
        'it returns one row': 'Both do. The plan is about what was read, not what came back.',
      },
      hints: [
        'Compare the two words. They are not two spellings of the same thing.',
        'Nothing indexes `order_id`, so the first query has no way to know which rows match without looking at each one.',
      ],
    },
    canonicalAnswer: 'It reads every row of the table.',
    solution: md(
      'It reads every row of `order_items` and keeps the ones matching `order_id = 5`.',
      '',
      '`SCAN` is a read of the whole thing. `SEARCH` is a lookup that goes straight to the qualifying rows, here through the rowid, which is what `id` is.'
    ),
    explanation:
      '`SCAN` and `SEARCH` are the two words worth reading first in any SQLite plan. A `SCAN` costs what the table costs, so it is fine on 40 rows and is the outage on 40 million; a `SEARCH` costs roughly what the result costs, because the index or rowid gets it to the qualifying rows without touching the rest. That is the whole reason to look at a plan: the query text tells you nothing about which of the two you got, and the same query flips between them as the schema changes. SQLite prints `SEARCH` even when the lookup returns many rows, so the word means "it knew where to start", not "it found one row".',
  },

  // Captured against a throwaway copy, since practice.db has no secondary indexes:
  //   cp apps/server/data/practice.db /tmp/indexed.db
  //   sqlite3 /tmp/indexed.db "CREATE INDEX books_genre ON books(genre);
  //                            CREATE INDEX books_genre_title ON books(genre, title);"
  //   sqlite3 /tmp/indexed.db "EXPLAIN QUERY PLAN SELECT title FROM books WHERE genre = 'Fantasy';"
  //   sqlite3 /tmp/indexed.db "EXPLAIN QUERY PLAN SELECT price FROM books WHERE genre = 'Fantasy';"
  {
    slug: 'sqlperf-plan-covering-index',
    title: 'The word COVERING in a plan',
    category: 'sql-performance',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      '`books` has two indexes: `books_genre` on `(genre)`, and `books_genre_title` on `(genre, title)`. Two queries, same filter, different select list.',
      '',
      code('sql', "SELECT title FROM books WHERE genre = 'Fantasy';"),
      code(
        'text',
        'QUERY PLAN',
        '`--SEARCH books USING COVERING INDEX books_genre_title (genre=?)'
      ),
      '',
      code('sql', "SELECT price FROM books WHERE genre = 'Fantasy';"),
      code('text', 'QUERY PLAN', '`--SEARCH books USING INDEX books_genre (genre=?)'),
      '',
      'What does `COVERING` say the first query never has to do?'
    ),
    graderConfig: {
      accept: [
        'it never reads the table',
        'read the table',
        'touch the table',
        'go to the table',
        'look up the row in the table',
        'fetch the row from the table',
        'it answers from the index alone',
      ],
      acceptPatterns: [
        '(read|touch|visit|open|fetch|hit|go|skip|avoid|return)\\w*\\b[^.]{0,40}\\btable',
        '\\b(table|row)s?\\s*-?\\s*look ?ups?',
        'from the index alone',
        'only the index',
        'without the table',
      ],
      nearMisses: {
        'it uses an index':
          'Both plans use one. `COVERING` says the first gets something extra out of its index.',
        'the index covers every row':
          'Covering is not about which rows are in the index. It is about which columns.',
        'it is faster': 'It is. Say which piece of work it skips.',
        'it does not have to sort': 'Neither plan sorts. Look at where each one gets its columns.',
        'it does not need a second index':
          'Both indexes exist here. The question is what the wider one lets the query skip.',
      },
      hints: [
        'The filter is identical and the plans differ, so the difference is in the select list.',
        '`books_genre_title` holds `genre` and `title`. `books_genre` holds `genre`.',
        '`price` is in neither index, so the second plan has to go somewhere else to get it.',
      ],
    },
    canonicalAnswer: 'It never reads the table. Every column it needs is already in the index.',
    solution: md(
      'It never reads the table. `genre` and `title` are both in `books_genre_title`, so the index entry is the whole answer and the row is never fetched.',
      '',
      '`price` is in no index, so the second plan finds the matching entries and then goes to the table for each one.'
    ),
    explanation:
      'An index entry holds the indexed columns and a pointer to the row, so a query naming only indexed columns can be answered from the index and stops there: SQLite prints that as `COVERING INDEX`, and Postgres calls it an Index Only Scan. The saving is one table read per matching row, which is the part that is random I/O on a large table, so widening an index to cover a hot query is often a bigger win than adding another index. It is not free: every extra column makes the index bigger to store and slower to write on update. Adding `price` to that index would cover the second query too, and would also make the index recompute on every price change.',
  },

  // Captured. The "after" plan needs an index, so it comes from a throwaway copy:
  //   sqlite3 apps/server/data/practice.db \
  //     "EXPLAIN QUERY PLAN SELECT title, price FROM books ORDER BY price DESC LIMIT 5;"
  //   cp apps/server/data/practice.db /tmp/indexed.db
  //   sqlite3 /tmp/indexed.db "CREATE INDEX books_price ON books(price);"
  //   sqlite3 /tmp/indexed.db \
  //     "EXPLAIN QUERY PLAN SELECT title, price FROM books ORDER BY price DESC LIMIT 5;"
  {
    slug: 'sqlperf-plan-temp-btree-sort',
    title: 'The extra line under an ORDER BY',
    category: 'sql-performance',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'The five priciest books, planned against a table with no index on `price`:',
      '',
      code('sql', 'SELECT title, price FROM books ORDER BY price DESC LIMIT 5;'),
      code('text', 'QUERY PLAN', '|--SCAN books', '`--USE TEMP B-TREE FOR ORDER BY'),
      '',
      'Add `CREATE INDEX books_price ON books(price)` and the same query plans as:',
      '',
      code('text', 'QUERY PLAN', '`--SCAN books USING INDEX books_price'),
      '',
      'Say what the second line of the first plan is doing, and why the second plan does not need it.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'temp',
            'temporary',
            'b-tree',
            'btree',
            'builds',
            'build',
            'sorts the rows',
            'sort the rows',
            'sorts them',
            'sorts the result',
            'does the sorting',
            'sorting them',
          ],
          missingFeedback:
            'Nothing in a table is stored in price order. Say what the query has to make before it can return a row.',
        },
        {
          synonyms: [
            'already',
            'index is sorted',
            'stored in order',
            'stored in price order',
            'index order',
            'no sort',
            'without sorting',
            'nothing to sort',
            'comes out in order',
            'reads them in order',
            'walks the index',
            'walking the index',
          ],
          missingFeedback:
            'An index is not just a lookup structure. Say what is true of the order its entries sit in.',
        },
      ],
      hints: [
        'The line appears only in the plan with no index. Read what it says it is for.',
        'Rows in a table sit in rowid order, which has nothing to do with price.',
        'A B-tree on `price` is that ordering, written down once instead of rebuilt per query.',
      ],
    },
    canonicalAnswer:
      'The first plan builds a temporary B-tree at query time and feeds every row through it, because the table holds nothing in price order and the sort has to be done from scratch. The second plan walks the index instead, whose entries are already in price order, so the rows arrive sorted and there is nothing left to sort.',
    solution: md(
      '`USE TEMP B-TREE FOR ORDER BY` is SQLite sorting the rows itself: a throwaway structure, built for this query, that every qualifying row is pushed through before the first one comes out.',
      '',
      'A B-tree index on `price` **is** that ordering, stored once. Walking it produces the rows already sorted, so the sort step disappears from the plan.'
    ),
    explanation:
      'A temp B-tree is the planner saying it could not get the order for free and is buying it, at the cost of touching every qualifying row before it can emit one. That is what makes the `LIMIT 5` misleading: with no index, every row still has to be read and compared before anybody knows which five come first, while with the index the walk stops after five. An index in the right order collapses the two steps into one walk, which is why `ORDER BY` plus `LIMIT` on a big table is the pattern that most reliably justifies an index. The same line appears as `USE TEMP B-TREE FOR GROUP BY` when a grouping has no ordered input to lean on.',
  },

  // Captured:
  //   sqlite3 apps/server/data/practice.db \
  //     "EXPLAIN QUERY PLAN SELECT title FROM books WHERE price > (SELECT AVG(price) FROM books);"
  //   sqlite3 apps/server/data/practice.db \
  //     "EXPLAIN QUERY PLAN SELECT title FROM books b
  //        WHERE price > (SELECT AVG(price) FROM books x WHERE x.genre = b.genre);"
  {
    slug: 'sqlperf-plan-correlated-subquery',
    title: 'One word between cheap and quadratic',
    category: 'sql-performance',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'Books priced above the average, twice: once against the average of everything, once against the average within their own genre.',
      '',
      code('sql', 'SELECT title FROM books WHERE price > (SELECT AVG(price) FROM books);'),
      code('text', 'QUERY PLAN', '|--SCAN books', '`--SCALAR SUBQUERY 1', '   `--SCAN books'),
      '',
      code(
        'sql',
        'SELECT title FROM books b',
        'WHERE price > (SELECT AVG(price) FROM books x WHERE x.genre = b.genre);'
      ),
      code('text', 'QUERY PLAN', '|--SCAN b', '`--CORRELATED SCALAR SUBQUERY 1', '   `--SCAN x'),
      '',
      'Both plans print the inner `SCAN` once. Say how many times each one actually runs, and what in the query text decides it.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'once per row',
            'per row',
            'for every row',
            'for each row',
            'each row',
            'every row',
            '15 times',
            'fifteen times',
            'once for each',
            'once for every',
            're-run',
            'rerun',
            'again for every',
            'again for each',
          ],
          missingFeedback:
            'A subquery that needs a value from the row being tested cannot be answered ahead of time. Say how often it has to be answered.',
        },
        {
          synonyms: [
            'references',
            'reference',
            'refers to',
            'refer to',
            'mentions',
            'depends on',
            'correlated',
            'outer',
            'b.genre',
            'a column from the row',
            'a value from the row',
          ],
          missingFeedback:
            'One subquery can be answered on its own and one cannot. Say what the second one needs that the first does not.',
        },
      ],
      hints: [
        'Compare the two subqueries before you compare the two plans. One line differs.',
        'Ask whether each subquery could be run on its own, with the outer query deleted.',
        '`x.genre = b.genre` names a column of the row being tested, so there is no single answer to compute up front.',
      ],
    },
    canonicalAnswer:
      'The first subquery runs once: it references nothing outside itself, so the average is computed one time and every row is compared against that value. The second is correlated, because `x.genre = b.genre` refers to the outer row, so it is re-run for each row of the outer scan: 15 rows, 15 scans of the same table.',
    solution: md(
      '- **`SCALAR SUBQUERY`** runs once. Nothing in it depends on the outer query, so the value is computed and reused.',
      '- **`CORRELATED SCALAR SUBQUERY`** runs once per row of the outer scan, because `x.genre = b.genre` names a column of the row being tested.',
      '',
      'Fifteen books here, so fifteen scans of `books` inside one scan of `books`.'
    ),
    explanation:
      'The plan prints the subquery once whichever it is, so `CORRELATED` is the only thing standing between "computed once" and "computed per row", and it is worth reading for on sight. The rows multiply: an outer scan of N rows over an inner scan of N rows is N squared reads, which is invisible on 15 books and is the incident report on 15 million. The fix is usually to compute the inner result once for every key at once, as a window function or a join to a grouped subquery, rather than once per row. Correlation is not automatically bad, though. A correlated `EXISTS` that can stop at its first match is often the cheapest thing in the query.',
  },

  // Both forms plan identically, which is the point the explanation makes. The
  // early exit is visible in the bytecode instead, captured with:
  //   sqlite3 apps/server/data/practice.db "EXPLAIN <each form of the query below>"
  // EXISTS ends its inner loop on the first match (Integer 1 → DecrJumpZero out of
  // the loop); COUNT runs AggStep for every match and compares after AggFinal.
  sqlProblem({
    slug: 'sqlperf-exists-not-count',
    title: 'A count where a yes would do',
    category: 'sql-performance',
    difficulty: 'easy',
    relevance: 'occasional',
    prompt: md(
      'This runs a full `COUNT` over `orders` for every customer, to answer a yes-or-no question:',
      '',
      code(
        'sql',
        'SELECT c.name',
        'FROM customers c',
        'WHERE (SELECT COUNT(*) FROM orders o',
        "       WHERE o.customer_id = c.id AND o.status = 'cancelled') > 0;"
      ),
      '',
      'Return the same names using `EXISTS`, so the inner query can stop at its first match.',
      '',
      "One column: `name`. Row order doesn't matter."
    ),
    solutionSql:
      "SELECT c.name FROM customers c WHERE EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.status = 'cancelled');",
    orderMatters: false,
    solutionSource: [
      'SELECT c.name',
      'FROM customers c',
      'WHERE EXISTS (',
      '  SELECT 1 FROM orders o',
      "  WHERE o.customer_id = c.id AND o.status = 'cancelled'",
      ');',
    ],
    hints: [
      'The number is thrown away the moment it is compared. Only one bit of it is ever used.',
      '`EXISTS (…)` is true as soon as the subquery produces a row, and what the subquery selects is irrelevant.',
      "`WHERE EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.status = 'cancelled')`",
    ],
    explanation:
      "`EXISTS` stops at the first matching row. `COUNT(*) > 0` has to visit all of them before the comparison can happen, so a customer with one cancelled order and a customer with ten thousand cost the same query very different amounts. SQLite's bytecode shows it directly: the `EXISTS` form jumps out of the inner loop the moment it finds a row, while the `COUNT` form runs an `AggStep` for every match and only compares at the end. `EXPLAIN QUERY PLAN` does not show this at all, because both forms plan as the same correlated subquery, which makes it one to know rather than one to read off a plan. `SELECT 1` is conventional inside `EXISTS` and nothing turns on it: `SELECT *` plans identically, because the column list is never evaluated.",
  }),

  // The plan claim in the explanation, both halves:
  //   sqlite3 apps/server/data/practice.db \
  //     "EXPLAIN QUERY PLAN SELECT b.title,
  //        (SELECT COUNT(*) FROM reviews r WHERE r.book_id = b.id) AS reviews FROM books b;"
  //   |--SCAN b / `--CORRELATED SCALAR SUBQUERY 1 / `--SCAN r
  //   sqlite3 apps/server/data/practice.db "EXPLAIN QUERY PLAN <the solutionSql below>"
  //   |--SCAN b / |--BLOOM FILTER ON r (book_id=?)
  //   `--SEARCH r USING AUTOMATIC COVERING INDEX (book_id=?) LEFT-JOIN
  sqlProblem({
    slug: 'sqlperf-scalar-subquery-to-join',
    title: 'The N+1 written in SQL',
    category: 'sql-performance',
    difficulty: 'medium',
    relevance: 'daily',
    prompt: md(
      'Every row of this result runs its own `COUNT` over `reviews`:',
      '',
      code(
        'sql',
        'SELECT b.title,',
        '       (SELECT COUNT(*) FROM reviews r WHERE r.book_id = b.id) AS reviews',
        'FROM books b;'
      ),
      '',
      'Return the same 15 rows **without a subquery in the select list**. Three books have no reviews and still have to come back, with `0`.',
      '',
      "Columns: `title`, `reviews`. Row order doesn't matter."
    ),
    solutionSql:
      'SELECT b.title, COUNT(r.id) AS reviews FROM books b LEFT JOIN reviews r ON r.book_id = b.id GROUP BY b.id, b.title;',
    orderMatters: false,
    solutionSource: [
      'SELECT b.title, COUNT(r.id) AS reviews',
      'FROM books b',
      'LEFT JOIN reviews r ON r.book_id = b.id',
      'GROUP BY b.id, b.title;',
    ],
    hints: [
      'One pass over `reviews` can produce all 15 counts, if the rows are grouped by book first.',
      'An inner join would drop the three books that match nothing, so it has to be a `LEFT JOIN`.',
      'Group by `b.id, b.title` and count `r.id`, not `*`, so an unmatched book reports 0.',
    ],
    explanation:
      'The subquery form is an N+1 expressed in one statement: its plan reads `CORRELATED SCALAR SUBQUERY`, and the inner scan of `reviews` runs once per book. The join form reads `reviews` once, and SQLite builds a single automatic covering index on `book_id` to match against, so the cost stops being books multiplied by reviews. `COUNT(r.id)` is what keeps the three unreviewed books at 0: after a `LEFT JOIN` those rows carry NULL on the right, `COUNT` skips NULLs, and `COUNT(*)` would count the padded row and report 1. Group by `b.id` as well as the title so two books sharing a title would still be two groups.',
  }),

  // The two plans quoted in the explanation:
  //   sqlite3 apps/server/data/practice.db \
  //     "EXPLAIN QUERY PLAN SELECT id, ordered_at, status FROM orders
  //        ORDER BY id LIMIT 5 OFFSET 10;"           →  `--SCAN orders
  //   sqlite3 apps/server/data/practice.db \
  //     "EXPLAIN QUERY PLAN SELECT id, ordered_at, status FROM orders
  //        WHERE id > 10 ORDER BY id LIMIT 5;"
  //     →  `--SEARCH orders USING INTEGER PRIMARY KEY (rowid>?)
  sqlProblem({
    slug: 'sqlperf-keyset-page',
    title: 'A page without OFFSET',
    category: 'sql-performance',
    difficulty: 'medium',
    relevance: 'daily',
    prompt: md(
      'The orders list pages five at a time, sorted by `id`. Page 3 is fetched like this:',
      '',
      code('sql', 'SELECT id, ordered_at, status FROM orders ORDER BY id LIMIT 5 OFFSET 10;'),
      '',
      'The last row on page 2 had `id = 10`. Return the same page **without `OFFSET`**, using that id.',
      '',
      'Columns: `id`, `ordered_at`, `status`. **Row order matters here.**'
    ),
    solutionSql: 'SELECT id, ordered_at, status FROM orders WHERE id > 10 ORDER BY id LIMIT 5;',
    orderMatters: true,
    solutionSource: [
      'SELECT id, ordered_at, status',
      'FROM orders',
      'WHERE id > 10',
      'ORDER BY id',
      'LIMIT 5;',
    ],
    hints: [
      'The database still has to reach row 11. `OFFSET` reaches it by reading the first ten and discarding them.',
      'You already know where this page starts. Nothing is stopping you from saying so.',
      '`WHERE id > 10 ORDER BY id LIMIT 5`',
    ],
    explanation:
      '`OFFSET 10` is not a starting position, it is ten rows read and thrown away, and the plans say so: the `OFFSET` form is `SCAN orders`, this one is `SEARCH orders USING INTEGER PRIMARY KEY (rowid>?)`. Page 500 of a 20-per-page list reads 10,000 rows to return 20, while a keyset page descends straight to its first row whatever the page number. It also closes a bug `OFFSET` has on live data: insert or delete a row while somebody is paging and every later offset shifts, so a row is repeated or skipped, whereas `id > 10` stays anchored to a value rather than to a position. What you give up is jumping to page 47, which is why this is the shape for infinite scroll and cursor APIs and not for numbered pages.',
  }),

  // The plan claim in the explanation, both halves:
  //   sqlite3 apps/server/data/practice.db \
  //     "EXPLAIN QUERY PLAN SELECT o.ordered_at, c.name FROM orders o
  //        JOIN customers c ON c.id = o.customer_id WHERE o.status = 'completed'
  //        ORDER BY o.ordered_at DESC LIMIT 4;"
  //   |--SCAN o / |--SEARCH c USING INTEGER PRIMARY KEY (rowid=?) / `--USE TEMP B-TREE FOR ORDER BY
  //   sqlite3 apps/server/data/practice.db "EXPLAIN QUERY PLAN <the solutionSql below>"
  //   |--CO-ROUTINE recent (SCAN orders, USE TEMP B-TREE FOR ORDER BY) / |--SCAN r
  //   `--SEARCH c USING INTEGER PRIMARY KEY (rowid=?)
  sqlProblem({
    slug: 'sqlperf-limit-before-join',
    title: 'Four rows, joined at the end',
    category: 'sql-performance',
    difficulty: 'hard',
    relevance: 'occasional',
    prompt: md(
      "The dashboard wants the four most recent completed orders with the customer's name. Written this way, `customers` is searched once per completed order and the sort happens after the join:",
      '',
      code(
        'sql',
        'SELECT o.ordered_at, c.name',
        'FROM orders o',
        'JOIN customers c ON c.id = o.customer_id',
        "WHERE o.status = 'completed'",
        'ORDER BY o.ordered_at DESC',
        'LIMIT 4;'
      ),
      '',
      'Return the same four rows with the filter, the `ORDER BY` and the `LIMIT` applied to `orders` **before anything is joined to it**.',
      '',
      'Columns: `ordered_at`, `name`. **Row order matters here.**'
    ),
    solutionSql:
      "WITH recent AS (SELECT id, customer_id, ordered_at FROM orders WHERE status = 'completed' ORDER BY ordered_at DESC LIMIT 4) SELECT r.ordered_at, c.name FROM recent r JOIN customers c ON c.id = r.customer_id ORDER BY r.ordered_at DESC;",
    orderMatters: true,
    solutionSource: [
      'WITH recent AS (',
      '  SELECT id, customer_id, ordered_at',
      '  FROM orders',
      "  WHERE status = 'completed'",
      '  ORDER BY ordered_at DESC',
      '  LIMIT 4',
      ')',
      'SELECT r.ordered_at, c.name',
      'FROM recent r',
      'JOIN customers c ON c.id = r.customer_id',
      'ORDER BY r.ordered_at DESC;',
    ],
    hints: [
      'Nothing about which four rows you want depends on `customers`.',
      'A CTE or a subquery can hold the filtered, sorted, limited slice of `orders` on its own.',
      "`WITH recent AS (SELECT id, customer_id, ordered_at FROM orders WHERE status = 'completed' ORDER BY ordered_at DESC LIMIT 4)`, then join `customers` to `recent`.",
    ],
    explanation:
      "Both queries return the same four rows and their plans differ: the first searches `customers` for every completed order and sorts afterwards, while the second sorts `orders` alone and reaches `customers` four times. Narrow before you join whenever the join has no say in which rows survive, and the saving grows with the table rather than with the page. Note what this is **not**, because the folk version of the rule is wrong: moving a plain predicate like `status = 'completed'` into a subquery changes nothing on its own, since the planner pushes it down for you and both forms plan identically. A `LIMIT` is the barrier it cannot push through, which is what leaves this rewrite yours to make.",
  }),

  // Captured:
  //   sqlite3 apps/server/data/practice.db \
  //     "EXPLAIN QUERY PLAN SELECT id, ordered_at, status FROM orders
  //        WHERE id > 10 ORDER BY id LIMIT 20;"
  //   sqlite3 apps/server/data/practice.db "EXPLAIN QUERY PLAN SELECT COUNT(*) FROM orders;"
  // The claim about an index only narrowing the scan, checked the same way:
  //   sqlite3 /tmp/indexed.db "EXPLAIN QUERY PLAN SELECT COUNT(*) FROM books;"
  //   `--SCAN books USING COVERING INDEX books_price
  {
    slug: 'sqlperf-count-total-cost',
    title: 'The total is the expensive half',
    category: 'sql-performance',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'A list endpoint returns a page of rows and a total, so it runs two queries:',
      '',
      code('sql', 'SELECT id, ordered_at, status FROM orders WHERE id > 10 ORDER BY id LIMIT 20;'),
      code('text', 'QUERY PLAN', '`--SEARCH orders USING INTEGER PRIMARY KEY (rowid>?)'),
      '',
      code('sql', 'SELECT COUNT(*) FROM orders;'),
      code('text', 'QUERY PLAN', '`--SCAN orders'),
      '',
      'The page stays 20 rows however big the table gets. Say what the count costs instead, and what an index on `orders` would and would not change about it.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'every row',
            'all the rows',
            'all rows',
            'the whole table',
            'entire table',
            'each row',
            'every entry',
            'grows with the table',
            'scales with the table',
            'proportional to the table',
            'the size of the table',
            'how big the table',
          ],
          missingFeedback:
            'The `LIMIT` is what lets the page stop early. Say what the count has to get through, since nothing stops it.',
        },
        {
          synonyms: [
            'still has to',
            'still reads',
            'still scans',
            'still have to',
            'narrower',
            'smaller',
            'less data',
            'fewer pages',
            'covering index',
            'the whole index',
            'every index entry',
            'no shortcut',
            'stop early',
            'stop it early',
            'no stored count',
            'nothing stores the count',
          ],
          missingFeedback:
            'An index would change which structure gets scanned. Say whether it changes how much of that structure is read.',
        },
      ],
      hints: [
        'The page stops after 20 rows because the `LIMIT` tells it to. Nothing tells the count to stop.',
        'SQLite stores no row count anywhere. The number exists only once something has produced it.',
        'An index would give it something narrower to scan, and it would still have to scan all of it.',
      ],
    },
    canonicalAnswer:
      'The count costs the whole table: nothing stores the number, so every row has to be visited and the cost grows with the table while the page stays flat. An index does not fix that. It only gives SQLite something narrower to read, so the plan becomes a scan of a covering index instead of the table, and it still has to read every entry.',
    solution: md(
      'The page is bounded by the `LIMIT` and the count is bounded by the table, so the response gets slower as the data grows even though the page never does.',
      '',
      'An index changes `SCAN orders` into `SCAN orders USING COVERING INDEX …`: narrower rows, same number of them. There is no stored total to look up.'
    ),
    explanation:
      'A `LIMIT` lets a plan stop early; an unfiltered `COUNT(*)` cannot, because nothing anywhere holds the number and the only way to produce it is to visit every row. An index makes that visit cheaper per row and no shorter, which is why "add an index" is the wrong instinct here and reaching for a different answer is the right one: drop the exact total, cache it, or show an estimate. Postgres behaves the same way and keeps an approximate row count in `pg_class.reltuples`, updated by `VACUUM` and `ANALYZE`, which is usually what a "roughly 12,000 results" label should be reading. Adding a `WHERE` does not rescue it either: the filter has to be evaluated on every row before anything can be counted.',
  },

  // The two reps below are about the cost of a bulk *write* rather than the plan of
  // a read, and they are Postgres where the rest of this file is SQLite. They sit
  // here because the first one is the same defect as `sqlperf-keyset-page` seen from
  // the writing end, and separating them would hide that. Both were measured against
  // PostgreSQL 17.10 on a table of 500,000 rows; the numbers quoted are from the runs.
  {
    slug: 'sqlperf-backfill-offset-skips',
    title: 'The backfill that missed half the table',
    category: 'sql-performance',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A backfill fills in a new column in batches, advancing the offset each pass and stopping when a pass updates nothing:',
      '',
      code(
        'sql',
        "UPDATE orders SET region = 'eu-west-1'",
        'WHERE id IN (',
        '  SELECT id FROM orders WHERE region IS NULL ORDER BY id LIMIT 10000 OFFSET :n',
        ');'
      ),
      '',
      'It runs to completion with no error. Half the rows still have `region` set to `NULL`.',
      '',
      'Explain why, and give a fix.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'shrink',
            'smaller',
            'no longer match',
            'stop matching',
            'leave the set',
            'removes them',
            'changes the set',
            'moving target',
            'fewer rows',
          ],
          missingFeedback:
            'What does each batch do to the set of rows the next batch is paging through?',
        },
        {
          synonyms: ['skip', 'past', 'over', 'miss', 'jump', 'never reached', 'steps'],
          missingFeedback: 'Given that, where does the next OFFSET land?',
        },
        {
          synonyms: [
            'keyset',
            'id >',
            'last id',
            'cursor',
            'primary key',
            'no offset',
            'without offset',
            'drop the offset',
            'seek',
            'remember where',
          ],
          missingFeedback: 'Give a fix.',
        },
      ],
      hints: [
        'Run two batches in your head. What has the first UPDATE done to the rows the second one counts through?',
        'The offset counts into a set that is now 10,000 rows shorter than it was when the offset was chosen.',
        'Page on something the backfill cannot move: keep the last id written and select `WHERE id > last_id`.',
      ],
    },
    canonicalAnswer:
      'Each batch sets region on the rows it touched, so those rows leave the region IS NULL set and the set shrinks by exactly one batch every pass. The next statement then applies OFFSET 10000 to a set that has already lost its first 10,000 rows, so it skips 10,000 rows that still need updating and starts past them. Every batch misses as many rows as it writes. Page on the primary key instead: keep the last id you wrote and select WHERE id > last_id, so the cursor names a position the update cannot move.',
    solution: code(
      'sql',
      '-- The offset counts into a set the UPDATE is changing underneath it.',
      "UPDATE orders SET region = 'eu-west-1'",
      'WHERE id IN (SELECT id FROM orders WHERE region IS NULL ORDER BY id LIMIT 10000 OFFSET :n);',
      '',
      '-- A key the backfill cannot move. :cursor starts at 0 and becomes the batch max.',
      "UPDATE orders SET region = 'eu-west-1'",
      'WHERE id IN (SELECT id FROM orders WHERE id > :cursor ORDER BY id LIMIT 10000)',
      'RETURNING id;'
    ),
    explanation:
      'Measured on 500,000 rows against PostgreSQL 17.10, the offset version left 250,000 of them untouched and exited normally, which is what makes this worth practising: there is no error, the loop terminates, and the table is half done. It is the same defect as offset pagination over a list somebody is inserting into, except self-inflicted, because the predicate the offset counts through is the one the statement is falsifying. Two things follow. Any cursor a backfill pages on has to be stable under the backfill\'s own writes, which a primary key is and a filtered position is not. And a backfill needs a check that it finished, not just a loop that stopped: count the rows still matching the predicate afterwards, because "the last batch updated nothing" and "there is nothing left to update" are different statements.',
  },

  {
    slug: 'sqlperf-backfill-open-transaction',
    title: 'VACUUM reclaimed nothing',
    category: 'sql-performance',
    difficulty: 'hard',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A backfill has rewritten all 500,000 rows of a Postgres table, leaving 500,000 dead row versions behind it. `VACUUM` runs and clears none of them.',
      '',
      'Nothing is writing. The only other session is an analytics query that opened a transaction an hour ago and does not read this table at all.',
      '',
      'Explain why `VACUUM` could not reclaim them, and what to change.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'visible',
            'snapshot',
            'mvcc',
            'old version',
            'row version',
            'could still see',
            'might see',
            'still see',
          ],
          missingFeedback: 'What has to be true of a row version before VACUUM may remove it?',
        },
        {
          synonyms: [
            'oldest',
            'horizon',
            'xmin',
            'still open',
            'still running',
            'has not committed',
            "hasn't committed",
            'database-wide',
            'whole database',
            'not per-table',
            'any transaction',
          ],
          missingFeedback:
            'The analytics query never touches this table. Why does it hold the backfill up anyway?',
        },
        {
          synonyms: [
            'idle_in_transaction',
            'statement_timeout',
            'short',
            'bound',
            'terminate',
            'pg_terminate_backend',
            'split',
            'chunk',
            'read replica',
            'end it',
          ],
          missingFeedback: 'What do you change, given the fix is not on the backfill side?',
        },
      ],
      hints: [
        'VACUUM is not allowed to remove a version somebody might still be entitled to read.',
        'That entitlement is a snapshot, and the analytics query took one an hour ago and still holds it.',
        'The horizon is the oldest open snapshot in the database, whatever tables it reads. Fix the reporting session.',
      ],
    },
    canonicalAnswer:
      'VACUUM may only remove a row version once no running transaction could still see it. The analytics query took its snapshot an hour ago and has not committed, so every version that was live at that moment has to stay, and which tables it reads is irrelevant: the horizon is the oldest open snapshot in the database rather than a per-table one. So the fix is on the reporting side, not the backfill side. Keep that transaction short, bound it with idle_in_transaction_session_timeout, move it to a read replica, and watch pg_stat_activity for a large age(backend_xmin) whenever vacuum stops keeping up.',
    solution: code(
      'sql',
      '-- Who is holding the horizon open:',
      'SELECT pid, state, age(backend_xmin) AS xmin_age, query',
      'FROM pg_stat_activity',
      'WHERE backend_xmin IS NOT NULL',
      'ORDER BY age(backend_xmin) DESC;',
      '',
      '-- The blunt guard, so one forgotten session cannot do this again:',
      "SET idle_in_transaction_session_timeout = '5min';"
    ),
    explanation:
      'Measured: with one idle `REPEATABLE READ` transaction open elsewhere in the database, `VACUUM` left all 500,000 dead tuples in place, and the identical `VACUUM` cleared every one of them the moment that session committed. Postgres puts the rule plainly, that a row version "must not be deleted while it is still potentially visible to other transactions", and the whole of this is that "potentially" is decided by the oldest open snapshot rather than by what anybody actually read. Two consequences worth carrying. A long transaction is expensive even when it is idle and even when it is read-only, which is not how a transaction is usually described. And the pair of workloads is what causes it: a backfill alone is fine, a reporting query alone is fine, and together they produce garbage neither can clear. Note also what did not happen, which is the backfill blocking readers: `UPDATE` takes `ROW EXCLUSIVE` and a plain `SELECT` takes `ACCESS SHARE`, and those two do not conflict.',
  },
];
