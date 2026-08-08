import { code, md, type ProblemDraft, sqlProblem } from './types';

/**
 * SQL problems run against practice.db. Grading compares raw row values against
 * the canonical query executed at the same moment, so aliases never matter —
 * but row order does wherever `orderMatters` is true, and those queries are
 * chosen so the sort key has no ties.
 */
export const sqlProblems: ProblemDraft[] = [
  sqlProblem({
    slug: 'sql-select-genre',
    title: 'Filter books by genre',
    difficulty: 'easy',
    relevance: 'daily',
    prompt: md(
      'List the titles of all books in the **Fantasy** genre.',
      '',
      "Return one column: `title`. Row order doesn't matter."
    ),
    solutionSql: "SELECT title FROM books WHERE genre = 'Fantasy';",
    orderMatters: false,
    solutionSource: ['SELECT title', 'FROM books', "WHERE genre = 'Fantasy';"],
    hints: [
      'You only need the `books` table.',
      "Filter rows with `WHERE genre = 'Fantasy'`. String literals use single quotes.",
    ],
    explanation:
      '`WHERE` filters rows before they are returned, so only the Fantasy rows survive. String literals in SQLite use **single** quotes. Double quotes mean *identifier* (a column or table name), which is why `WHERE genre = "Fantasy"` usually fails with "no such column". Selecting just `title` keeps the result to one column, which is what the problem asked for.',
  }),

  sqlProblem({
    slug: 'sql-top-recent',
    title: 'Five priciest recent books',
    difficulty: 'easy',
    relevance: 'daily',
    prompt: md(
      'Show the **title and price** of the 5 most expensive books published after 2015, most expensive first.',
      '',
      'Columns: `title`, `price`. **Row order matters here.**'
    ),
    solutionSql:
      'SELECT title, price FROM books WHERE published_year > 2015 ORDER BY price DESC LIMIT 5;',
    orderMatters: true,
    solutionSource: [
      'SELECT title, price',
      'FROM books',
      'WHERE published_year > 2015',
      'ORDER BY price DESC',
      'LIMIT 5;',
    ],
    hints: [
      'Combine a WHERE filter with ORDER BY.',
      '`ORDER BY price DESC` sorts high→low; `LIMIT 5` keeps the top 5.',
    ],
    explanation:
      'SQL evaluates `WHERE` first, then `ORDER BY`, then `LIMIT`, so the limit applies to the *sorted, filtered* set, not to the raw table. Swapping that mental order is the classic bug: filtering after limiting would give you the 5 priciest books overall and then throw some away. `> 2015` excludes 2015 itself; use `>= 2016` if you prefer, it is the same set for integer years.',
  }),

  sqlProblem({
    slug: 'sql-distinct-cities',
    title: 'Deduplicate a column',
    difficulty: 'easy',
    relevance: 'daily',
    prompt: md(
      'Two customers live in Bristol. List each customer **city exactly once**.',
      '',
      "One column: `city`. Row order doesn't matter."
    ),
    solutionSql: 'SELECT DISTINCT city FROM customers;',
    orderMatters: false,
    hints: [
      'There is a keyword that collapses duplicate rows.',
      '`SELECT DISTINCT city FROM customers`. DISTINCT applies to the whole selected row, not to one column.',
    ],
    explanation:
      '`DISTINCT` deduplicates the **entire selected row**, not the column it appears next to. `SELECT DISTINCT city, name` would give you every row back, because the name makes each pair unique. `GROUP BY city` would also work and is what you reach for once you need a count alongside. On a large table both need to sort or hash the rows, so neither is free.',
  }),

  sqlProblem({
    slug: 'sql-count-genre',
    title: 'Count matching rows',
    difficulty: 'easy',
    relevance: 'daily',
    prompt: md(
      'How many books are in the **Mystery** genre?',
      '',
      'Return a single row with a single column holding the count.'
    ),
    solutionSql: "SELECT COUNT(*) FROM books WHERE genre = 'Mystery';",
    orderMatters: false,
    hints: [
      'Aggregate functions collapse many rows into one.',
      '`SELECT COUNT(*) FROM books WHERE genre = ...`',
    ],
    explanation:
      '`COUNT(*)` counts rows that survived the `WHERE`, so filtering and counting compose naturally. `COUNT(column)` is different. It skips NULLs in that column, which is exactly what you want when counting "how many rows actually have a value". An aggregate with no `GROUP BY` always returns exactly one row, even when nothing matched (you get 0, not an empty result).',
  }),

  sqlProblem({
    slug: 'sql-null-check',
    title: 'Find NULLs',
    difficulty: 'easy',
    relevance: 'daily',
    prompt: md(
      'Some reviews were left without written feedback. Return the `id` of every review whose `comment` is NULL.',
      '',
      "One column: `id`. Row order doesn't matter."
    ),
    solutionSql: 'SELECT id FROM reviews WHERE comment IS NULL;',
    orderMatters: false,
    hints: [
      'NULL is not a value you can compare with `=`.',
      'Use `WHERE comment IS NULL`. `= NULL` is never true.',
    ],
    explanation:
      "NULL means *unknown*, so `comment = NULL` evaluates to NULL rather than true, and `WHERE` only keeps rows where the condition is **true**: you get zero rows back and no error, which is why this bug survives code review. `IS NULL` / `IS NOT NULL` are the only correct tests. The same trap bites `!=`: `comment != 'x'` silently drops NULL rows too.",
  }),

  sqlProblem({
    slug: 'sql-in-list',
    title: 'Match any of several values',
    difficulty: 'easy',
    relevance: 'daily',
    prompt: md(
      'List the title and genre of every book in the **Fantasy** or **Science** genre.',
      '',
      "Columns: `title`, `genre`. Row order doesn't matter."
    ),
    solutionSql: "SELECT title, genre FROM books WHERE genre IN ('Fantasy', 'Science');",
    orderMatters: false,
    hints: [
      'You could write two conditions joined with OR. There is a shorter way.',
      "`WHERE genre IN ('Fantasy', 'Science')`",
    ],
    explanation:
      "`IN (…)` is shorthand for a chain of `OR` equality checks and reads far better once the list grows. Watch out for `NOT IN` combined with NULLs: if the list contains a NULL, `NOT IN` returns NULL for every row and you get nothing back. `NOT EXISTS` is the safe alternative. `IN` also accepts a subquery, which is how you filter by another table's keys.",
  }),

  sqlProblem({
    slug: 'sql-like-search',
    title: 'Pattern matching',
    difficulty: 'easy',
    relevance: 'daily',
    prompt: md(
      'Find every book whose title **starts with** `The`.',
      '',
      "One column: `title`. Row order doesn't matter."
    ),
    solutionSql: "SELECT title FROM books WHERE title LIKE 'The%';",
    orderMatters: false,
    hints: [
      'Pattern matching uses a dedicated operator, not `=`.',
      '`%` matches any run of characters. Where you put it decides the shape of the match.',
      "`LIKE 'The%'` anchors at the start; `'%The%'` would match anywhere.",
    ],
    explanation:
      "`LIKE` matches patterns where `%` is any sequence of characters and `_` is exactly one. Wildcard placement is the whole game: `'The%'` is a prefix match, `'%The'` a suffix match, `'%The%'` a contains match. Only the prefix form can use a normal B-tree index. A leading `%` forces a full scan, which is why production \"search\" boxes end up on a full-text index. Also note SQLite's `LIKE` is case-insensitive for ASCII by default, unlike Postgres where you would need `ILIKE`.",
  }),

  sqlProblem({
    slug: 'sql-between-years',
    title: 'Inclusive range filter',
    difficulty: 'easy',
    relevance: 'daily',
    prompt: md(
      'List the title and publication year of books published from **2015 to 2018 inclusive**.',
      '',
      "Columns: `title`, `published_year`. Row order doesn't matter."
    ),
    solutionSql:
      'SELECT title, published_year FROM books WHERE published_year BETWEEN 2015 AND 2018;',
    orderMatters: false,
    hints: [
      'Two comparisons would work; one operator does it in a single expression.',
      '`BETWEEN 2015 AND 2018` is inclusive at both ends.',
    ],
    explanation:
      "`BETWEEN a AND b` is inclusive on both sides. Identical to `>= a AND <= b`. That inclusivity is a real hazard with timestamps: `BETWEEN '2024-01-01' AND '2024-01-31'` silently drops everything that happened during the 31st after midnight. For date ranges prefer the half-open form `>= start AND < next_start`.",
  }),

  sqlProblem({
    slug: 'sql-join-author-name',
    title: 'Pull a name from another table',
    difficulty: 'easy',
    relevance: 'daily',
    prompt: md(
      '`books` stores an `author_id`, not an author name. List every book with the name of its author.',
      '',
      "Columns: `title`, `name`. Row order doesn't matter."
    ),
    solutionSql: 'SELECT b.title, a.name FROM books b JOIN authors a ON a.id = b.author_id;',
    orderMatters: false,
    solutionSource: [
      'SELECT b.title, a.name',
      'FROM books b',
      'JOIN authors a ON a.id = b.author_id;',
    ],
    hints: [
      'The name lives in `authors`. `books.author_id` says which row to go and get.',
      'Alias both tables so `b.title` and `a.name` are unambiguous.',
      '`JOIN authors a ON a.id = b.author_id`',
    ],
    explanation:
      'A join emits one row for every pair that satisfies the `ON` condition. Each of the 15 books matches exactly one author, so 15 rows come back and nothing looks unusual. Join to a table with many rows per book instead, like `reviews`, and the same rule gives you one row per review with the title repeated: 32 rows for 15 books. That fan-out is the whole of the duplicated name, the inflated `SUM` and the `COUNT` that is too big. Leave the `ON` off entirely and SQLite pairs every book with every author, all 120 combinations.',
  }),

  sqlProblem({
    slug: 'sql-having-count-genres',
    title: 'Filter the groups, not the rows',
    difficulty: 'easy',
    relevance: 'daily',
    prompt: md(
      'Which genres have **more than 3** books? Show the genre and its book count.',
      '',
      "Columns: `genre`, `books`. Row order doesn't matter."
    ),
    solutionSql: 'SELECT genre, COUNT(*) AS books FROM books GROUP BY genre HAVING COUNT(*) > 3;',
    orderMatters: false,
    solutionSource: [
      'SELECT genre, COUNT(*) AS books',
      'FROM books',
      'GROUP BY genre',
      'HAVING COUNT(*) > 3;',
    ],
    hints: [
      'The condition is about a count, and a count is a property of a group.',
      '`WHERE` runs before the groups exist. Something else runs after them.',
      '`GROUP BY genre HAVING COUNT(*) > 3`',
    ],
    explanation:
      '`WHERE` runs before `GROUP BY`, so there is no group to count yet and SQLite stops you with `misuse of aggregate: COUNT()`. `HAVING` runs after grouping, where each group is one thing with its count already computed. The test for which one you want takes a second: if a single row can decide the condition, it belongs in `WHERE`; if it mentions an aggregate, it belongs in `HAVING`. A `HAVING` with no `GROUP BY` is legal and means something else entirely, since the whole result becomes one group and a false condition returns zero rows rather than a count of 0.',
  }),

  sqlProblem({
    slug: 'sql-in-subquery',
    title: 'Filter by another table without joining',
    difficulty: 'easy',
    relevance: 'daily',
    prompt: md(
      'List the title of every book that has at least one review.',
      '',
      "One column: `title`. Row order doesn't matter."
    ),
    solutionSql: 'SELECT title FROM books WHERE id IN (SELECT book_id FROM reviews);',
    orderMatters: false,
    solutionSource: ['SELECT title', 'FROM books', 'WHERE id IN (SELECT book_id FROM reviews);'],
    hints: [
      'The reviews decide which books qualify, but you need no column from them.',
      'A subquery returning a single column can feed `IN`.',
      '`WHERE id IN (SELECT book_id FROM reviews)`',
    ],
    explanation:
      '`IN` with a subquery is a test on the outer row: keep it or drop it, never duplicate it. `JOIN reviews` answers the same question and emits one row per review instead, so 12 books come back as 32 rows and need a `DISTINCT` to get to 12 again. Reach for `IN` or `EXISTS` whenever the other table contributes nothing to the output. The negative form is where this gets dangerous: `NOT IN` over a subquery holding a single NULL returns no rows at all, with no error, so `NOT EXISTS` is the safe way to spell "has no reviews".',
  }),

  sqlProblem({
    slug: 'sql-window-row-number',
    title: 'Number the rows without collapsing them',
    difficulty: 'easy',
    relevance: 'daily',
    prompt: md(
      'Number the books by price, 1 for the most expensive down to 15 for the cheapest, and show that number next to the title and price.',
      '',
      'Columns: `title`, `price`, `position`. **Row order matters here.**'
    ),
    solutionSql:
      'SELECT title, price, ROW_NUMBER() OVER (ORDER BY price DESC) AS position FROM books ORDER BY price DESC;',
    orderMatters: true,
    solutionSource: [
      'SELECT title, price,',
      '       ROW_NUMBER() OVER (ORDER BY price DESC) AS position',
      'FROM books',
      'ORDER BY price DESC;',
    ],
    hints: [
      'Every book still has to appear, so this is not a `GROUP BY`.',
      'A window function computes over other rows and leaves the current one standing.',
      '`ROW_NUMBER() OVER (ORDER BY price DESC)`',
    ],
    explanation:
      "`OVER` is what makes a function a window function: it adds a column computed across a set of other rows and removes none of them. The `ORDER BY` inside the parentheses decides the numbering; the one at the end decides how the rows come out. They agree here, and often they do not. Every price in this table is distinct, so the numbering is deterministic. Once there are ties, `ROW_NUMBER()` still hands out 1, 2, 3 and picks a winner the query never asked for, which is when you want `RANK()`, where peers share a number and the next value skips over them, or a tiebreaker column inside the window's `ORDER BY`.",
  }),

  sqlProblem({
    slug: 'sql-batch-related-rows',
    title: 'Fetch related rows in one query',
    difficulty: 'easy',
    relevance: 'daily',
    prompt: md(
      "An orders page loops over its orders and runs a separate query for each one's line items. Fetch the line items for orders 1, 3 and 9 in a **single** query instead.",
      '',
      "Columns: `order_id`, `book_id`, `quantity`. Row order doesn't matter."
    ),
    solutionSql: 'SELECT order_id, book_id, quantity FROM order_items WHERE order_id IN (1, 3, 9);',
    orderMatters: false,
    solutionSource: [
      'SELECT order_id, book_id, quantity',
      'FROM order_items',
      'WHERE order_id IN (1, 3, 9);',
    ],
    hints: [
      'The three queries differ only in the id they filter on.',
      'One filter can accept a list of values instead of a single one.',
      'Use `WHERE order_id IN (1, 3, 9)`, and keep `order_id` in the select list.',
    ],
    explanation:
      'Batching turns N+1 round trips into two: one query for the list, one for everything it referenced. `order_id` has to stay in the select list because the rows come back as one flat set and the application groups them back onto their orders. The other fix is a join, which is one statement instead of two but fans each order out to one row per line item; batching is the one that still works when the second table lives behind another service or has its own pagination. Watch the list length, though, because databases cap how many bound parameters a statement can take, so a batch over tens of thousands of ids has to be chunked.',
  }),

  sqlProblem({
    slug: 'sql-orders-per-customer',
    title: 'Completed orders per customer',
    difficulty: 'medium',
    relevance: 'daily',
    prompt: md(
      'For **every** customer, show their name and how many **completed** orders they have placed. Including customers with zero.',
      '',
      "Columns: `name`, `order_count`. Row order doesn't matter."
    ),
    solutionSql:
      "SELECT c.name, COUNT(o.id) AS order_count FROM customers c LEFT JOIN orders o ON o.customer_id = c.id AND o.status = 'completed' GROUP BY c.id, c.name;",
    orderMatters: false,
    solutionSource: [
      'SELECT c.name, COUNT(o.id) AS order_count',
      'FROM customers c',
      'LEFT JOIN orders o',
      "  ON o.customer_id = c.id AND o.status = 'completed'",
      'GROUP BY c.id, c.name;',
    ],
    hints: [
      '"Including zero" means an INNER JOIN won\'t work.',
      'Careful: filtering status in WHERE turns a LEFT JOIN back into an inner join. Put the status condition in the ON clause.',
      'COUNT(o.id) counts matched rows only; COUNT(*) would count zero-order customers as 1.',
    ],
    explanation:
      "A `LEFT JOIN` keeps every customer row and fills the order columns with NULL when nothing matches. The trap is **ON vs WHERE**: `WHERE o.status = 'completed'` runs *after* the join and discards those NULL rows, silently turning the LEFT JOIN back into an inner join, so customers with no completed orders vanish. Putting the condition in `ON` makes it part of the match instead. Finally, `COUNT(o.id)` ignores NULLs and correctly reports 0, whereas `COUNT(*)` counts the customer row itself and reports 1.",
  }),

  sqlProblem({
    slug: 'sql-anti-join',
    title: 'Rows with no match (anti-join)',
    difficulty: 'medium',
    relevance: 'daily',
    prompt: md(
      'Three books have never been reviewed. List their titles.',
      '',
      "One column: `title`. Row order doesn't matter."
    ),
    solutionSql:
      'SELECT b.title FROM books b LEFT JOIN reviews r ON r.book_id = b.id WHERE r.id IS NULL;',
    orderMatters: false,
    solutionSource: [
      'SELECT b.title',
      'FROM books b',
      'LEFT JOIN reviews r ON r.book_id = b.id',
      'WHERE r.id IS NULL;',
    ],
    hints: [
      'Start from every book and attach reviews optionally.',
      'After a LEFT JOIN, unmatched rows have NULL in every column from the right table.',
      '`WHERE r.id IS NULL` keeps exactly the books that matched nothing.',
    ],
    explanation:
      'This is the **anti-join** pattern: LEFT JOIN to the other table, then keep only the rows where the right side came back NULL. It works because a LEFT JOIN NULL-pads non-matches, so `r.id IS NULL` can only be true when no review existed. `NOT EXISTS (SELECT 1 FROM reviews r WHERE r.book_id = b.id)` expresses the same thing and is usually clearer; `NOT IN` is the one to avoid, because a single NULL in the subquery makes it return nothing at all.',
  }),

  sqlProblem({
    slug: 'sql-having-avg',
    title: 'Filter on an aggregate',
    difficulty: 'medium',
    relevance: 'daily',
    prompt: md(
      'Show each book that has **3 or more reviews**, with its average rating.',
      '',
      "Columns: `title`, `avg_rating`. Row order doesn't matter."
    ),
    solutionSql:
      'SELECT b.title, AVG(r.rating) AS avg_rating FROM books b JOIN reviews r ON r.book_id = b.id GROUP BY b.id, b.title HAVING COUNT(r.id) >= 3;',
    orderMatters: false,
    solutionSource: [
      'SELECT b.title, AVG(r.rating) AS avg_rating',
      'FROM books b',
      'JOIN reviews r ON r.book_id = b.id',
      'GROUP BY b.id, b.title',
      'HAVING COUNT(r.id) >= 3;',
    ],
    hints: [
      'You cannot filter on COUNT(...) in a WHERE clause.',
      '`WHERE` runs before grouping; `HAVING` runs after.',
      '`GROUP BY b.id, b.title HAVING COUNT(r.id) >= 3`',
    ],
    explanation:
      '`WHERE` filters individual rows *before* they are grouped, so aggregates do not exist yet and `WHERE COUNT(*) >= 3` is a syntax error. `HAVING` filters the **groups** after aggregation, which is where conditions on `COUNT`, `SUM` or `AVG` belong. Group by `b.id` as well as `b.title` so two books that happened to share a title would still be separate groups. Grouping by the primary key is the habit worth keeping.',
  }),

  sqlProblem({
    slug: 'sql-coalesce-stock',
    title: 'Default a missing value',
    difficulty: 'medium',
    relevance: 'daily',
    prompt: md(
      'Three books have no row in `inventory` at all. List **every** book with its stock level, showing `0` for books with no inventory record.',
      '',
      "Columns: `title`, `stock`. Row order doesn't matter."
    ),
    solutionSql:
      'SELECT b.title, COALESCE(i.stock, 0) AS stock FROM books b LEFT JOIN inventory i ON i.book_id = b.id;',
    orderMatters: false,
    solutionSource: [
      'SELECT b.title, COALESCE(i.stock, 0) AS stock',
      'FROM books b',
      'LEFT JOIN inventory i ON i.book_id = b.id;',
    ],
    hints: [
      'Every book must appear, so the join has to be a LEFT JOIN.',
      'A missing inventory row leaves `i.stock` NULL. You need to substitute a value.',
      '`COALESCE(i.stock, 0)` returns the first non-NULL argument.',
    ],
    explanation:
      '`COALESCE(a, b, …)` returns its first non-NULL argument, which is the standard way to give a LEFT JOIN a sensible default. It matters for arithmetic too: `stock - 1` is NULL when stock is NULL, so a single missing row poisons the whole expression silently. `IFNULL(x, 0)` is the SQLite-specific two-argument version. `COALESCE` is the portable one.',
  }),

  sqlProblem({
    slug: 'sql-self-join',
    title: 'Join a table to itself',
    difficulty: 'medium',
    relevance: 'occasional',
    prompt: md(
      "The `employees` table points at itself through `manager_id`. List every employee with their manager's name.",
      '',
      "Include the CEO, whose `manager_id` is NULL. Their manager name should come back NULL. Columns: `name`, `manager_name`. Row order doesn't matter."
    ),
    solutionSql:
      'SELECT e.name, m.name AS manager_name FROM employees e LEFT JOIN employees m ON m.id = e.manager_id;',
    orderMatters: false,
    solutionSource: [
      'SELECT e.name, m.name AS manager_name',
      'FROM employees e',
      'LEFT JOIN employees m ON m.id = e.manager_id;',
    ],
    hints: [
      'The same table can appear twice in one query if you alias it.',
      'Alias the two copies `e` (employee) and `m` (manager).',
      'A plain JOIN would drop the CEO. Use LEFT JOIN so a NULL manager_id survives.',
    ],
    explanation:
      'A **self-join** is an ordinary join where both sides happen to be the same table; the aliases are what make it work, since `employees.name` would otherwise be ambiguous. `LEFT JOIN` is essential here. The CEO has a NULL `manager_id`, which matches nothing, so an inner join would quietly drop them. This same shape handles any parent/child hierarchy one level deep; for arbitrary depth you need a recursive CTE.',
  }),

  sqlProblem({
    slug: 'sql-direct-reports',
    title: 'Count children per parent',
    difficulty: 'medium',
    relevance: 'occasional',
    prompt: md(
      'For each employee who manages at least one person, show their name and how many **direct** reports they have, most reports first.',
      '',
      'Columns: `name`, `reports`. **Row order matters here.**'
    ),
    solutionSql:
      'SELECT m.name, COUNT(e.id) AS reports FROM employees m JOIN employees e ON e.manager_id = m.id GROUP BY m.id, m.name ORDER BY reports DESC;',
    orderMatters: true,
    solutionSource: [
      'SELECT m.name, COUNT(e.id) AS reports',
      'FROM employees m',
      'JOIN employees e ON e.manager_id = m.id',
      'GROUP BY m.id, m.name',
      'ORDER BY reports DESC;',
    ],
    hints: [
      'Self-join again, but this time you want managers on the left.',
      'An inner join is right here. Managers with no reports should not appear.',
      'Group by the manager and count the joined employee rows.',
    ],
    explanation:
      'Flipping which side of the self-join you group by flips the question from "who is my manager" to "who reports to me". An **inner** join is correct this time, because the problem explicitly excludes managers with no reports. That filtering falls out of the join for free instead of needing a HAVING clause. You can sort by the alias `reports` because `ORDER BY` is evaluated after the select list, unlike `WHERE`.',
  }),

  sqlProblem({
    slug: 'sql-date-month',
    title: 'Group by month',
    difficulty: 'medium',
    relevance: 'daily',
    prompt: md(
      'Count **completed** orders per calendar month, oldest month first.',
      '',
      'Format the month as `YYYY-MM`. Columns: `month`, `orders`. **Row order matters here.**'
    ),
    solutionSql:
      "SELECT strftime('%Y-%m', ordered_at) AS month, COUNT(*) AS orders FROM orders WHERE status = 'completed' GROUP BY month ORDER BY month;",
    orderMatters: true,
    solutionSource: [
      "SELECT strftime('%Y-%m', ordered_at) AS month, COUNT(*) AS orders",
      'FROM orders',
      "WHERE status = 'completed'",
      'GROUP BY month',
      'ORDER BY month;',
    ],
    hints: [
      'You need to truncate a date down to its month before grouping.',
      'SQLite formats dates with `strftime(format, column)`.',
      "`strftime('%Y-%m', ordered_at)` gives `2023-01`, and you can GROUP BY that alias.",
    ],
    explanation:
      "Grouping by time always means projecting the timestamp down to the bucket you want first. `strftime('%Y-%m', …)` in SQLite, `date_trunc('month', …)` in Postgres, `DATE_FORMAT` in MySQL. Formatting as `YYYY-MM` is deliberate: it sorts lexicographically in true chronological order, which `MM-YYYY` would not. Note that SQLite lets you `GROUP BY` a select-list alias; standard SQL strictly does not, so portable code repeats the expression.",
  }),

  sqlProblem({
    slug: 'sql-repeat-customers',
    title: 'Customers who came back',
    difficulty: 'medium',
    relevance: 'occasional',
    prompt: md(
      'Find the customers who placed **more than one completed order**, with their order count.',
      '',
      "Columns: `name`, `order_count`. Row order doesn't matter."
    ),
    solutionSql:
      "SELECT c.name, COUNT(*) AS order_count FROM customers c JOIN orders o ON o.customer_id = c.id WHERE o.status = 'completed' GROUP BY c.id, c.name HAVING COUNT(*) > 1;",
    orderMatters: false,
    solutionSource: [
      'SELECT c.name, COUNT(*) AS order_count',
      'FROM customers c',
      'JOIN orders o ON o.customer_id = c.id',
      "WHERE o.status = 'completed'",
      'GROUP BY c.id, c.name',
      'HAVING COUNT(*) > 1;',
    ],
    hints: [
      'Both a WHERE and a HAVING clause are needed here.',
      'Filter the rows (status) with WHERE, filter the groups (count) with HAVING.',
    ],
    explanation:
      'This is the canonical shape of a cohort query: `WHERE` narrows the rows, `GROUP BY` collapses them per customer, `HAVING` keeps only the groups that clear a threshold. Because this is an inner join, the status filter is safe in `WHERE`. There are no NULL-padded rows to protect, unlike the LEFT JOIN case. Swap `> 1` for `>= 3` and you have a "power user" query with no restructuring.',
  }),

  sqlProblem({
    slug: 'sql-subquery-above-avg',
    title: 'Compare against an aggregate',
    difficulty: 'medium',
    relevance: 'occasional',
    prompt: md(
      'List the books priced **above the average price** of all books.',
      '',
      "Columns: `title`, `price`. Row order doesn't matter."
    ),
    solutionSql: 'SELECT title, price FROM books WHERE price > (SELECT AVG(price) FROM books);',
    orderMatters: false,
    solutionSource: [
      'SELECT title, price',
      'FROM books',
      'WHERE price > (SELECT AVG(price) FROM books);',
    ],
    hints: [
      '`WHERE price > AVG(price)` is not allowed. Aggregates cannot appear in WHERE.',
      'Compute the average in a subquery and compare against that single value.',
      '`WHERE price > (SELECT AVG(price) FROM books)`',
    ],
    explanation:
      'A **scalar subquery** returns exactly one value, so it can sit anywhere a literal could. Including inside `WHERE`, where a bare aggregate is illegal. This one is *uncorrelated*: it does not reference the outer query, so the database evaluates it once rather than per row. Make it correlated (say, the average within the same genre) and it conceptually runs per row, which is when you start reaching for a window function instead.',
  }),

  sqlProblem({
    slug: 'sql-case-buckets',
    title: 'Bucket rows with CASE',
    difficulty: 'medium',
    relevance: 'daily',
    prompt: md(
      'Bucket every book by price and count each bucket:',
      '',
      '- under 15 → `budget`',
      '- 15 up to but not including 25 → `standard`',
      '- 25 and over → `premium`',
      '',
      "Columns: `band`, `books`. Row order doesn't matter."
    ),
    solutionSql:
      "SELECT CASE WHEN price < 15 THEN 'budget' WHEN price < 25 THEN 'standard' ELSE 'premium' END AS band, COUNT(*) AS books FROM books GROUP BY band;",
    orderMatters: false,
    solutionSource: [
      'SELECT CASE',
      "         WHEN price < 15 THEN 'budget'",
      "         WHEN price < 25 THEN 'standard'",
      "         ELSE 'premium'",
      '       END AS band,',
      '       COUNT(*) AS books',
      'FROM books',
      'GROUP BY band;',
    ],
    hints: [
      'You need a computed column before you can group by it.',
      '`CASE WHEN … THEN … WHEN … THEN … ELSE … END`',
      'CASE stops at the first matching WHEN, so the second branch only sees prices >= 15.',
    ],
    explanation:
      '`CASE` evaluates its branches **in order** and stops at the first match, so the second condition only needs `price < 25`. The `< 15` rows were already claimed. That short-circuit is what keeps bucket definitions from needing overlapping range checks. Always include an `ELSE`: without one, unmatched rows get NULL and quietly form a mystery group.',
  }),

  sqlProblem({
    slug: 'sql-order-totals',
    title: 'Total value per order',
    difficulty: 'medium',
    relevance: 'daily',
    prompt: md(
      'For every **completed** order, compute its total value (`quantity × unit_price` summed across its items). Highest total first.',
      '',
      'Columns: `id`, `total`. **Row order matters here.**'
    ),
    solutionSql:
      "SELECT o.id, SUM(oi.quantity * oi.unit_price) AS total FROM orders o JOIN order_items oi ON oi.order_id = o.id WHERE o.status = 'completed' GROUP BY o.id ORDER BY total DESC;",
    orderMatters: true,
    solutionSource: [
      'SELECT o.id, SUM(oi.quantity * oi.unit_price) AS total',
      'FROM orders o',
      'JOIN order_items oi ON oi.order_id = o.id',
      "WHERE o.status = 'completed'",
      'GROUP BY o.id',
      'ORDER BY total DESC;',
    ],
    hints: [
      'The line items live in `order_items`; the status lives in `orders`.',
      'Multiply *before* you aggregate: SUM(quantity * unit_price).',
      'Group by the order id so each order collapses to one row.',
    ],
    explanation:
      'The row-level expression `quantity * unit_price` is evaluated per line item and *then* summed. `SUM(quantity) * SUM(unit_price)` is a completely different (and wrong) number, and it is the single most common mistake in this shape of query. Grouping by `o.id` is enough because it is the primary key: SQLite and Postgres both let you select other columns from that table once you group by its key.',
  }),

  sqlProblem({
    slug: 'sql-not-exists',
    title: 'Customers who never bought Fantasy',
    difficulty: 'medium',
    relevance: 'occasional',
    prompt: md(
      'Which customers have **never** ordered a Fantasy book? Count every order regardless of status.',
      '',
      "One column: `name`. Row order doesn't matter."
    ),
    solutionSql:
      "SELECT c.name FROM customers c WHERE NOT EXISTS (SELECT 1 FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN books b ON b.id = oi.book_id WHERE o.customer_id = c.id AND b.genre = 'Fantasy');",
    orderMatters: false,
    solutionSource: [
      'SELECT c.name',
      'FROM customers c',
      'WHERE NOT EXISTS (',
      '  SELECT 1',
      '  FROM orders o',
      '  JOIN order_items oi ON oi.order_id = o.id',
      '  JOIN books b       ON b.id = oi.book_id',
      "  WHERE o.customer_id = c.id AND b.genre = 'Fantasy'",
      ');',
    ],
    hints: [
      'You need "no matching row exists", not "some row does not match".',
      'A correlated subquery can reference the outer row: `WHERE o.customer_id = c.id`.',
      'Wrap it in `NOT EXISTS ( … )`.',
    ],
    explanation:
      '`NOT EXISTS` with a **correlated** subquery is the reliable way to express "has no matching row": the inner query references the outer `c.id`, and the database only needs to know whether *any* row comes back. Hence `SELECT 1`. The tempting alternative, `customer_id NOT IN (SELECT customer_id …)`, is a landmine: if that subquery yields even one NULL, `NOT IN` evaluates to NULL for every row and you get an empty result with no error.',
  }),

  sqlProblem({
    slug: 'sql-union-cities',
    title: 'Combine two result sets',
    difficulty: 'medium',
    relevance: 'occasional',
    prompt: md(
      'Produce one deduplicated list of every city that appears in **either** `customers` or `employees`.',
      '',
      "One column: `city`. Row order doesn't matter."
    ),
    solutionSql: 'SELECT city FROM customers UNION SELECT city FROM employees;',
    orderMatters: false,
    solutionSource: ['SELECT city FROM customers', 'UNION', 'SELECT city FROM employees;'],
    hints: [
      'A join is the wrong tool. You want to stack rows, not widen them.',
      '`UNION` stacks two result sets and removes duplicates; `UNION ALL` keeps them.',
    ],
    explanation:
      'Joins add **columns**, set operators add **rows**: reaching for the wrong one is a classic mix-up. `UNION` deduplicates the combined result (which costs a sort), while `UNION ALL` just concatenates and is meaningfully faster when you know there are no overlaps or you want the duplicates. Both sides must have the same number of columns with compatible types; the column names come from the first branch.',
  }),

  sqlProblem({
    slug: 'sql-conditional-aggregate',
    title: 'Pivot with conditional aggregation',
    difficulty: 'medium',
    relevance: 'occasional',
    prompt: md(
      'For each genre, count how many order items belong to **completed** orders and how many to **cancelled** ones, as two columns on one row.',
      '',
      "Columns: `genre`, `completed`, `cancelled`. Row order doesn't matter."
    ),
    solutionSql:
      "SELECT b.genre, SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) AS completed, SUM(CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled FROM order_items oi JOIN books b ON b.id = oi.book_id JOIN orders o ON o.id = oi.order_id GROUP BY b.genre;",
    orderMatters: false,
    solutionSource: [
      'SELECT b.genre,',
      "       SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) AS completed,",
      "       SUM(CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled",
      'FROM order_items oi',
      'JOIN books b  ON b.id = oi.book_id',
      'JOIN orders o ON o.id = oi.order_id',
      'GROUP BY b.genre;',
    ],
    hints: [
      'Two separate queries would give two result sets. You need one row per genre.',
      'Put the condition *inside* the aggregate rather than in WHERE.',
      "`SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)`",
    ],
    explanation:
      'Putting a `CASE` **inside** an aggregate is how you pivot rows into columns without a special PIVOT syntax. Each aggregate sees every row of the group but only counts the ones it cares about. A `WHERE` filter cannot do this, because it would remove rows the *other* column still needs. `COUNT(CASE WHEN … THEN 1 END)` works too, since `COUNT` ignores the NULLs from the missing `ELSE`.',
  }),

  sqlProblem({
    slug: 'sql-revenue-by-genre',
    title: 'Revenue by genre',
    difficulty: 'hard',
    relevance: 'daily',
    prompt: md(
      'Compute total revenue per genre across **completed** orders only, highest revenue first.',
      '',
      'Revenue = `quantity × unit_price`. Columns: `genre`, `revenue`. **Row order matters here.**'
    ),
    solutionSql:
      "SELECT b.genre, SUM(oi.quantity * oi.unit_price) AS revenue FROM order_items oi JOIN books b ON b.id = oi.book_id JOIN orders o ON o.id = oi.order_id WHERE o.status = 'completed' GROUP BY b.genre ORDER BY revenue DESC;",
    orderMatters: true,
    solutionSource: [
      'SELECT b.genre, SUM(oi.quantity * oi.unit_price) AS revenue',
      'FROM order_items oi',
      'JOIN books b  ON b.id = oi.book_id',
      'JOIN orders o ON o.id = oi.order_id',
      "WHERE o.status = 'completed'",
      'GROUP BY b.genre',
      'ORDER BY revenue DESC;',
    ],
    hints: [
      'You need three tables: order_items, books, orders.',
      'Aggregate with SUM(quantity * unit_price), grouped by genre.',
      "Don't forget to exclude cancelled orders with WHERE.",
    ],
    explanation:
      'The line item is the grain of the calculation, so `order_items` drives the query: join to `books` for the genre and to `orders` for the status. Because both joins are inner joins here, a `WHERE` filter on `orders.status` is safe. There are no NULL-padded rows to protect. The row-level expression `quantity * unit_price` is computed *before* the aggregate, so `SUM(quantity * unit_price)` is right while `SUM(quantity) * SUM(unit_price)` is very wrong. Cancelled orders in this dataset are large enough to change both the totals and their ordering, which is exactly why the filter matters.',
  }),

  sqlProblem({
    slug: 'sql-window-rank',
    title: 'Rank within a group',
    difficulty: 'hard',
    relevance: 'daily',
    prompt: md(
      'For each genre, find the **single highest-rated book** (by average review rating). Books with no reviews are excluded.',
      '',
      "Columns: `genre`, `title`. Row order doesn't matter."
    ),
    solutionSql:
      'WITH rated AS (SELECT b.genre, b.title, AVG(r.rating) AS avg_rating FROM books b JOIN reviews r ON r.book_id = b.id GROUP BY b.id, b.genre, b.title), ranked AS (SELECT genre, title, ROW_NUMBER() OVER (PARTITION BY genre ORDER BY avg_rating DESC) AS rn FROM rated) SELECT genre, title FROM ranked WHERE rn = 1;',
    orderMatters: false,
    solutionSource: [
      'WITH rated AS (',
      '  SELECT b.genre, b.title, AVG(r.rating) AS avg_rating',
      '  FROM books b',
      '  JOIN reviews r ON r.book_id = b.id',
      '  GROUP BY b.id, b.genre, b.title',
      '),',
      'ranked AS (',
      '  SELECT genre, title,',
      '         ROW_NUMBER() OVER (PARTITION BY genre ORDER BY avg_rating DESC) AS rn',
      '  FROM rated',
      ')',
      'SELECT genre, title FROM ranked WHERE rn = 1;',
    ],
    hints: [
      'Aggregate first to get one average per book, then rank those.',
      '`ROW_NUMBER() OVER (PARTITION BY genre ORDER BY avg_rating DESC)` numbers rows restarting at 1 per genre.',
      'You cannot filter on a window function directly. Wrap it in a CTE or subquery and filter `rn = 1` outside.',
    ],
    explanation:
      '**Top-N-per-group** is the hard SQL pattern most worth having at your fingertips, and the window-function answer is the one to know. `PARTITION BY` restarts the numbering for each genre while `ORDER BY` decides what counts as first. Window functions are evaluated *after* `WHERE` and `GROUP BY`, so you cannot filter on `rn` in the same query level. That is why the ranking goes in a CTE and the filter goes outside. Use `RANK()` instead of `ROW_NUMBER()` when ties should all win; `ROW_NUMBER()` picks an arbitrary one.',
  }),

  sqlProblem({
    slug: 'sql-running-total',
    title: 'Running total over time',
    difficulty: 'hard',
    relevance: 'occasional',
    prompt: md(
      'Show completed revenue per month **and** the cumulative revenue up to and including that month, oldest first.',
      '',
      'Columns: `month`, `revenue`, `running_total`. **Row order matters here.**'
    ),
    solutionSql:
      "WITH monthly AS (SELECT strftime('%Y-%m', o.ordered_at) AS month, SUM(oi.quantity * oi.unit_price) AS revenue FROM orders o JOIN order_items oi ON oi.order_id = o.id WHERE o.status = 'completed' GROUP BY month) SELECT month, revenue, SUM(revenue) OVER (ORDER BY month) AS running_total FROM monthly ORDER BY month;",
    orderMatters: true,
    solutionSource: [
      'WITH monthly AS (',
      "  SELECT strftime('%Y-%m', o.ordered_at) AS month,",
      '         SUM(oi.quantity * oi.unit_price) AS revenue',
      '  FROM orders o',
      '  JOIN order_items oi ON oi.order_id = o.id',
      "  WHERE o.status = 'completed'",
      '  GROUP BY month',
      ')',
      'SELECT month, revenue,',
      '       SUM(revenue) OVER (ORDER BY month) AS running_total',
      'FROM monthly',
      'ORDER BY month;',
    ],
    hints: [
      'Two steps: collapse to one row per month, then accumulate across those rows.',
      'A window function can aggregate *without* collapsing rows.',
      '`SUM(revenue) OVER (ORDER BY month)` defaults to "all rows from the start up to this one".',
    ],
    explanation:
      'An aggregate with `OVER (…)` computes across a window of rows while **keeping every row**, which is exactly what a running total needs. With an `ORDER BY` and no explicit frame, the default window is `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`: everything from the start of the partition through the current row. Omit the `ORDER BY` and you get the grand total on every row instead, which is a useful trick for "percentage of total" columns.',
  }),

  sqlProblem({
    slug: 'sql-cte-first-order',
    title: "Each customer's first order",
    difficulty: 'hard',
    relevance: 'occasional',
    prompt: md(
      'For every customer who has completed at least one order, show the date of their **first** completed order.',
      '',
      "Columns: `name`, `first_order`. Row order doesn't matter."
    ),
    solutionSql:
      "WITH firsts AS (SELECT customer_id, MIN(ordered_at) AS first_order FROM orders WHERE status = 'completed' GROUP BY customer_id) SELECT c.name, f.first_order FROM firsts f JOIN customers c ON c.id = f.customer_id;",
    orderMatters: false,
    solutionSource: [
      'WITH firsts AS (',
      '  SELECT customer_id, MIN(ordered_at) AS first_order',
      '  FROM orders',
      "  WHERE status = 'completed'",
      '  GROUP BY customer_id',
      ')',
      'SELECT c.name, f.first_order',
      'FROM firsts f',
      'JOIN customers c ON c.id = f.customer_id;',
    ],
    hints: [
      'Aggregate the orders down to one row per customer first.',
      '`MIN(ordered_at)` on ISO date text gives the earliest date.',
      'A CTE (`WITH … AS (…)`) lets you name that intermediate result and join to it.',
    ],
    explanation:
      "A **CTE** names an intermediate result so the final query reads like the sentence you would say out loud. Aggregate first, then decorate with names. `MIN` works directly on `YYYY-MM-DD` text because ISO-8601 sorts lexicographically in chronological order, which is the entire reason to store dates that way. Note that `MIN(ordered_at)` gives the earliest *date* but not the rest of that order's row; if you needed the order id too, you would rank with `ROW_NUMBER()` instead.",
  }),

  sqlProblem({
    slug: 'sql-percent-of-total',
    title: 'Share of total',
    difficulty: 'hard',
    relevance: 'occasional',
    prompt: md(
      'What share of completed revenue does each genre represent? Show the genre, its revenue, and its percentage of the overall total rounded to 1 decimal place. Largest share first.',
      '',
      'Columns: `genre`, `revenue`, `pct`. **Row order matters here.**'
    ),
    solutionSql:
      "WITH per_genre AS (SELECT b.genre AS genre, SUM(oi.quantity * oi.unit_price) AS revenue FROM order_items oi JOIN books b ON b.id = oi.book_id JOIN orders o ON o.id = oi.order_id WHERE o.status = 'completed' GROUP BY b.genre) SELECT genre, revenue, ROUND(revenue * 100.0 / SUM(revenue) OVER (), 1) AS pct FROM per_genre ORDER BY revenue DESC;",
    orderMatters: true,
    solutionSource: [
      'WITH per_genre AS (',
      '  SELECT b.genre AS genre,',
      '         SUM(oi.quantity * oi.unit_price) AS revenue',
      '  FROM order_items oi',
      '  JOIN books b  ON b.id = oi.book_id',
      '  JOIN orders o ON o.id = oi.order_id',
      "  WHERE o.status = 'completed'",
      '  GROUP BY b.genre',
      ')',
      'SELECT genre, revenue,',
      '       ROUND(revenue * 100.0 / SUM(revenue) OVER (), 1) AS pct',
      'FROM per_genre',
      'ORDER BY revenue DESC;',
    ],
    hints: [
      'You need each row to see the grand total across all rows.',
      'A window function with an empty `OVER ()` aggregates over every row of the result.',
      '`revenue * 100.0 / SUM(revenue) OVER ()`, wrapped in `ROUND(…, 1)`.',
    ],
    explanation:
      '`SUM(x) OVER ()`, an empty window, computes the grand total and attaches it to **every** row, which is the neat way to express "share of total" without a self-join or a second query. Multiplying by `100.0` rather than `100` forces floating-point division; with two integers many databases would do integer division and hand you 0. `ROUND(…, 1)` then trims the presentation noise.',
  }),

  sqlProblem({
    slug: 'sql-recursive-hierarchy',
    title: 'Walk a hierarchy (recursive CTE)',
    difficulty: 'hard',
    relevance: 'foundational',
    prompt: md(
      'List every employee together with their **depth** in the org chart: the CEO is depth 0, their direct reports are depth 1, and so on.',
      '',
      "Columns: `name`, `depth`. Row order doesn't matter."
    ),
    solutionSql:
      'WITH RECURSIVE chart AS (SELECT id, name, 0 AS depth FROM employees WHERE manager_id IS NULL UNION ALL SELECT e.id, e.name, chart.depth + 1 FROM employees e JOIN chart ON e.manager_id = chart.id) SELECT name, depth FROM chart;',
    orderMatters: false,
    solutionSource: [
      'WITH RECURSIVE chart AS (',
      '  -- anchor: everyone with no manager',
      '  SELECT id, name, 0 AS depth',
      '  FROM employees',
      '  WHERE manager_id IS NULL',
      '  UNION ALL',
      '  -- recursive step: anyone reporting to a row we already have',
      '  SELECT e.id, e.name, chart.depth + 1',
      '  FROM employees e',
      '  JOIN chart ON e.manager_id = chart.id',
      ')',
      'SELECT name, depth FROM chart;',
    ],
    hints: [
      'A self-join only reaches one level down. You need to repeat it until nothing new appears.',
      '`WITH RECURSIVE name AS (anchor UNION ALL recursive-step)`.',
      'The anchor is the CEO (`manager_id IS NULL`); the step joins employees back onto the CTE itself.',
    ],
    explanation:
      'A **recursive CTE** has two halves joined by `UNION ALL`: an anchor that seeds the result, and a step that references the CTE by name and runs repeatedly until it produces no new rows. Carrying `depth + 1` through the step is how you measure distance from the root. This is the tool for org charts, category trees, threaded comments and graph traversal. Anything where a plain join cannot know how deep to go. Guard against cycles in real data, or the recursion never terminates.',
  }),

  sqlProblem({
    slug: 'sql-dedupe-keep-latest',
    title: 'Keep only the latest row per key',
    difficulty: 'hard',
    relevance: 'daily',
    prompt: md(
      'For every book that has been reviewed, return only its **most recent** review: the book title, the rating and the review date.',
      '',
      "No book in the data has two reviews on the same day. Columns: `title`, `rating`, `created_at`. Row order doesn't matter."
    ),
    solutionSql:
      'WITH ranked AS (SELECT book_id, rating, created_at, ROW_NUMBER() OVER (PARTITION BY book_id ORDER BY created_at DESC) AS rn FROM reviews) SELECT b.title, r.rating, r.created_at FROM ranked r JOIN books b ON b.id = r.book_id WHERE r.rn = 1;',
    orderMatters: false,
    solutionSource: [
      'WITH ranked AS (',
      '  SELECT book_id, rating, created_at,',
      '         ROW_NUMBER() OVER (PARTITION BY book_id ORDER BY created_at DESC) AS rn',
      '  FROM reviews',
      ')',
      'SELECT b.title, r.rating, r.created_at',
      'FROM ranked r',
      'JOIN books b ON b.id = r.book_id',
      'WHERE r.rn = 1;',
    ],
    hints: [
      '`MAX(created_at)` gives you the date but loses the rating from that same row.',
      'Number the reviews per book, newest first, then keep number 1.',
      '`ROW_NUMBER() OVER (PARTITION BY book_id ORDER BY created_at DESC)`',
    ],
    explanation:
      'The instinctive `GROUP BY book_id, MAX(created_at)` answers "when" but cannot tell you the rating **from that row**: other columns are not carried along by an aggregate, and databases that let you select them anyway return an arbitrary row. Ranking with `ROW_NUMBER()` and filtering `rn = 1` keeps the whole winning row intact. This "latest record per key" query shows up constantly: current price per product, latest status per ticket, most recent login per user.',
  }),

  // The index problems below are deliberately not type `sql`. practice.db carries
  // no indexes, so nothing here can be demonstrated by running a query against it.
  // Every claim was checked against PostgreSQL 18 plans and the official docs.
  {
    slug: 'sql-index-range-descent',
    title: 'Reaching the end of an index without reading it',
    category: 'sql',
    difficulty: 'medium',
    relevance: 'foundational',
    type: 'short-text',
    prompt: md(
      '`orders` has 40 million rows and a B-tree index on `created_at`. A query for the last hour comes back in milliseconds:',
      '',
      code(
        'text',
        'Index Scan using orders_created_idx on orders',
        '  Index Cond: (created_at > $1)'
      ),
      '',
      'Those entries sit at the far end of the index. What does the index do to reach the first of them, instead of reading the 40 million entries in front?'
    ),
    graderConfig: {
      accept: [
        'descends the tree',
        'descend the tree',
        'tree descent',
        'descends from the root',
        'walks down from the root',
        'walks down the tree',
        'navigates down the tree',
        'a binary search down the tree',
        'binary search',
      ],
      acceptPatterns: [
        'descend',
        'walks? down',
        'from the root',
        'down the tree',
        'binary search',
        'navigat\\w* down',
      ],
      nearMisses: {
        'it scans the index':
          'Scanning is what happens once it arrives. Getting to the first matching entry is the part that is not a scan.',
        'a full index scan': 'That reads every entry, which is the thing this plan is avoiding.',
        'it reads the index from the start':
          'Nothing reads the 40 million entries in front. The index is not entered at the start.',
        'it uses the index': 'True, and the question is how. Name the movement it makes.',
      },
      hints: [
        'A sorted list would have to be walked from one end. This is not a list.',
        'Every lookup starts at the root page and picks one child at each level.',
      ],
    },
    canonicalAnswer: 'It descends the tree from the root, picking one child page per level.',
    solution: md(
      'It descends the tree. Start at the root page, compare, follow one child, repeat until you land on the leaf holding the first entry that satisfies the condition.',
      '',
      'One page read per level, and then a scan that stops as soon as the values pass the end of the range.'
    ),
    explanation:
      'A B-tree is not a sorted list, so nothing has to be walked to get to a range: at each level the index compares the key and follows a single child page, until it lands on the leaf holding the first qualifying entry. Only then does it scan, and it stops the moment the values leave the range. That is what turns "find rows after a timestamp" into a cost that tracks the number of rows returned rather than the number stored. Postgres notes that over 99% of the pages in a B-tree index are leaf pages, which is another way of saying the part you descend through is tiny.',
  },

  {
    slug: 'sql-index-order-desc',
    title: 'The DESC index nobody needs',
    category: 'sql',
    difficulty: 'easy',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      '`events` has an index on `created_at`. The dashboard runs `ORDER BY created_at DESC LIMIT 20`, and the plan has no sort step in it.',
      '',
      'A colleague wants to add a second index on `created_at DESC`, because the existing one "only sorts ascending". Say what the existing index is already doing, and name the case where a `DESC` inside `CREATE INDEX` does earn its place.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'backward',
            'backwards',
            'in reverse',
            'reverse',
            'other direction',
            'either direction',
            'both directions',
            'from the end',
            'right to left',
            'other end',
          ],
          missingFeedback:
            'The leaf pages of a B-tree are linked both ways. What can the planner do with that?',
        },
        {
          synonyms: [
            'mixed',
            'different directions',
            'opposite direction',
            'asc and desc',
            'multicolumn',
            'multi-column',
            'two columns',
            'more than one column',
            'directions differ',
            'disagree',
            'composite',
          ],
          missingFeedback:
            'Flipping the whole sort is free. A declared direction only starts to matter when the directions do not all flip together.',
        },
      ],
      hints: [
        'Compare the plan against the same query sorted ascending. One word differs.',
        'B-tree leaf pages are linked in both directions, so the whole sort can be flipped for nothing.',
        'A declared direction only pays when one column has to go one way and another the other way.',
      ],
    },
    canonicalAnswer:
      'The existing index is being read backwards. A B-tree links its leaf pages both ways, so a descending sort is the same walk in reverse and needs no sort step, which is why the mirror-image index would be dead weight. A DESC only earns its place on a multicolumn index whose directions differ, like (tenant_id ASC, created_at DESC), because that ordering cannot be produced by walking one plain index in either direction.',
    solution: md(
      'The index is read backwards. Postgres shows it as `Index Scan Backward`, and no `Sort` node appears.',
      '',
      'Flipping every column of the sort at once is free, so a mirror-image index costs writes and disk for nothing. The exception is a multicolumn index whose directions disagree: `(x, y)` serves `ORDER BY x, y` and `ORDER BY x DESC, y DESC`, but `ORDER BY x, y DESC` needs an index declared that way.'
    ),
    explanation:
      'A B-tree stores keys in one order and links its leaf pages in both directions, so `ORDER BY x DESC` is the same index read from the other end. That makes a second, mirrored index pure cost: more to write on every insert, more to keep on disk, and nothing gained. Where a direction genuinely matters is inside a multicolumn index, because `ORDER BY x, y DESC` asks for two orders at once and a single walk cannot produce it; Postgres plans that one with a sort step layered on top of the index scan.',
  },

  {
    slug: 'sql-index-unused-cost',
    title: 'The index nobody searched',
    category: 'sql',
    difficulty: 'easy',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A cleanup ticket says to drop the indexes nothing uses. On the `users` table in Postgres:',
      '',
      code(
        'text',
        'indexrelname       idx_scan',
        'users_email_key           0',
        'users_last_seen_idx       0'
      ),
      '',
      '`users_email_key` is the index behind `email text NOT NULL UNIQUE`. `users_last_seen_idx` was added for a dashboard that shipped a year ago.',
      '',
      'Say what an unused index is costing while it sits there, and why these two zeroes do not mean the same thing.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'every write',
            'every insert',
            'on insert',
            'writes',
            'write time',
            'disk',
            'storage',
            'space',
            'maintained',
            'kept up to date',
            'backup',
          ],
          missingFeedback:
            'The database keeps an index correct whether or not anything reads it. What does that cost, on the write side and on disk?',
        },
        {
          synonyms: [
            'unique',
            'uniqueness',
            'constraint',
            'enforces',
            'enforcing',
            'duplicate',
            'duplicates',
            'not counted',
            'does not count',
            'only counts',
            'searches',
            'queries',
          ],
          missingFeedback:
            'One of those two is doing a job that `idx_scan` never counts. What is `users_email_key` there for?',
        },
      ],
      hints: [
        'An index is a second copy of the column. Nothing stops maintaining it just because no query reads it.',
        '`idx_scan` counts times a query searched the index.',
        'One of these two indexes is the `UNIQUE` constraint. Dropping it drops the rule.',
      ],
    },
    canonicalAnswer:
      'An unused index still costs: an entry written into it on every insert, an entry removed on every delete, disk to store it and bytes in every backup. So dropping a genuinely unused one is worth doing. But idx_scan only counts queries that searched the index, and it never counts constraint enforcement, so users_email_key reads zero while still rejecting every duplicate email on write. Dropping it would drop the UNIQUE constraint. users_last_seen_idx has no such job and is the one to drop.',
    solution: md(
      'Drop `users_last_seen_idx`. Keep `users_email_key`.',
      '',
      'An index costs a write on every insert and delete, a write on every update to the column it covers, disk, and space in every backup. It pays that whether or not a query ever reads it.',
      '',
      '`idx_scan` counts index searches by queries. Enforcing a `UNIQUE` constraint is not one, so the index behind a unique constraint sits at zero however many duplicates it has rejected.'
    ),
    explanation:
      'An unused index is pure cost, so the cleanup instinct is right. What is wrong is the number it is being applied to: `idx_scan` counts queries that searched the index, and a unique constraint is enforced by a different path that never touches that counter. An index at `idx_scan = 0` that backs a `UNIQUE` or a primary key is doing its job silently, and dropping it removes the rule rather than the overhead. Check what an index is attached to before trusting the zero.',
  },

  {
    slug: 'sql-index-lower-email',
    title: 'The query that got slower by getting correct',
    category: 'sql',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'short-text',
    prompt: md(
      'Login ran `WHERE email = $1` off the index on `email` in a couple of milliseconds. Someone made it case-insensitive:',
      '',
      code('sql', 'SELECT id FROM users WHERE lower(email) = $1;'),
      '',
      'It now plans as `Seq Scan on users`, with `Filter: (lower(email) = $1)`. The index on `email` is still there.',
      '',
      'What has to be created?'
    ),
    graderConfig: {
      accept: [
        'an index on lower(email)',
        'index on lower(email)',
        'lower(email)',
        'an expression index on lower(email)',
        'a functional index on lower(email)',
        'create index on users (lower(email))',
        'an expression index',
      ],
      acceptPatterns: ['lower\\s*\\(\\s*email\\s*\\)', '(expression|functional)\\s+index'],
      nearMisses: {
        'an index on email':
          'That one already exists. Once the column is wrapped in a function, what the index stores is no longer what the query compares.',
        'a partial index':
          'A partial index changes which rows are indexed. What is wrong here is which value is indexed.',
        'reindex the table': 'Rebuilding it gives you the same index over the same values.',
        'analyze the table': 'The planner is right. There is nothing indexed for it to choose.',
      },
      hints: [
        'The planner matches what the query asks for against what the index actually stores.',
        'The index holds `email`. The query no longer mentions `email` on its own.',
        'Postgres can index the result of a function.',
      ],
    },
    canonicalAnswer: 'An index on lower(email)',
    solution: md(
      code('sql', 'CREATE INDEX users_lower_email_idx ON users (lower(email));'),
      '',
      'The query has to spell the expression the same way the index declares it.'
    ),
    explanation:
      'An index stores the values you told it to store, and `email` is not `lower(email)`, so there is nothing for the planner to descend and it falls back to reading every row and applying the function. An expression index stores the computed value instead, and the query only uses it if it spells the expression the same way. The cost lands on writes, because the expression is recomputed on every insert and non-HOT update; it is never recomputed during a search. SQLite has had expression indexes since 3.9.0 and is stricter about the match: `x + y` and `y + x` are the same number and two different index keys.',
  },

  {
    slug: 'sql-index-like-prefix',
    title: 'One wildcard changes the plan',
    category: 'sql',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'An autocomplete box runs `WHERE email LIKE $1`. With `ali%` the plan is an index scan on `users_email_idx`. With `%ali%` it is a sequential scan over every row. Same column, same index.',
      '',
      'Say what the planner turns the anchored pattern into, and why the leading `%` leaves it nothing to work with.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'range',
            'between',
            '>=',
            'two comparisons',
            'two bounds',
            'bounds',
            'lower and upper',
            'upper bound',
            'greater than or equal',
            'contiguous',
          ],
          missingFeedback:
            'The `Index Cond` on the fast plan does not mention `LIKE` at all. What does it get rewritten to?',
        },
        {
          synonyms: [
            'no prefix',
            'nothing to descend',
            'no starting point',
            'anywhere',
            'any position',
            'not anchored',
            'no anchor',
            'every row',
            'whole table',
            'all the rows',
            'could start anywhere',
            'unknown start',
          ],
          missingFeedback:
            'An index is sorted by the whole string from its first character. What does `%ali%` fail to tell it?',
        },
      ],
      hints: [
        'Look at the `Index Cond` on the fast plan. It is not a pattern match.',
        'An index is sorted by the whole string, starting at its first character.',
        '`ali%` pins down the first three characters. `%ali%` pins down nothing.',
      ],
    },
    canonicalAnswer:
      "The anchored pattern is rewritten as a range: the Index Cond becomes email >= 'ali' AND email < 'alj', a contiguous run the index can be descended to. With a leading % there is no prefix to descend to, because a match could begin at any position in the string, so nothing narrows the scan and every row has to be read.",
    solution: md(
      "`LIKE 'ali%'` becomes a range. The `Index Cond` reads `email >= 'ali' AND email < 'alj'`, which is an ordinary bounded scan.",
      '',
      'A leading `%` names no first character, so every row is a candidate and reading them all is the only honest plan.'
    ),
    explanation:
      'A B-tree is sorted by the whole string from the first character on, so a known prefix is a known place to start and Postgres rewrites the pattern into a plain range. A leading `%` supplies no first character, and no amount of index makes an unbounded search bounded. Two caveats travel with this: outside the C locale the index needs `text_pattern_ops` for the rewrite to apply, and SQLite optimises `LIKE` only when the column is indexed `BINARY` with `case_sensitive_like` on, or `NOCASE` with it off. When the pattern genuinely has to float, the answer is a trigram index rather than a B-tree.',
  },

  {
    slug: 'sql-index-composite-order',
    title: 'What a composite index is actually sorted by',
    category: 'sql',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      '`events` holds 200,000 tenants and has one index, on `(tenant_id, created_at)`.',
      '',
      '- `WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 20` is instant, and the plan has no sort step.',
      '- `WHERE created_at > $1`, with no tenant in the query, returns 1,000 rows and reads every page of the index to find them.',
      '',
      'Say why the first gets its ordering for nothing, and why the second has to read all of the index.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'contiguous',
            'one run',
            'a single run',
            'together',
            'already sorted',
            'sorted within',
            'in order within',
            'already in order',
            'one block',
            'next to each other',
            'adjacent',
          ],
          missingFeedback:
            'Fixing `tenant_id` picks out one stretch of the index. What is already true about the order inside that stretch?',
        },
        {
          synonyms: [
            'leading',
            'leftmost',
            'left-most',
            'first column',
            'not the first',
            'second column',
            'scattered',
            'interleaved',
            'every tenant',
            'each tenant',
            'restarts',
            'starts over',
            'only within',
            'many places',
          ],
          missingFeedback:
            'Where does one `created_at` value live, in an index sorted by tenant first?',
        },
      ],
      hints: [
        'The index is sorted by `tenant_id` first, and by `created_at` only inside each one.',
        'Ask where the entries for a single tenant sit relative to each other.',
        'Then ask where one `created_at` value sits when the tenant is not pinned down.',
      ],
    },
    canonicalAnswer:
      'An equality on tenant_id picks out one contiguous run of the index, and inside that run the entries are already sorted by created_at, so the newest 20 are the last 20 entries of the run read backwards and no sort step is needed. The second query constrains only the second column, and created_at restarts from the beginning inside every tenant, so there is no single position to descend to and the matching entries are spread across the whole index, which is why all of it has to be read.',
    solution: md(
      'A composite index is sorted by its first column, and by the second only inside a run where the first is equal.',
      '',
      '- `tenant_id = $1` lands on one such run, whose entries are already in `created_at` order. The `ORDER BY` is free, and `DESC` is that run read backwards.',
      '- `created_at > $1` alone has no run to land on, because those values start over in every tenant. The index is still the cheapest plan, but only as a read of the whole thing.'
    ),
    explanation:
      'A composite index is sorted by its first column, and by the second only within a run where the first is equal. Both symptoms fall out of that one rule, and so does the advice about column order: the column you filter by equality goes first, the column you sort by goes second. Postgres 18 can still use the index for a predicate on the second column, by repeating the descent once per distinct leading value, but that skip scan needs a leading column with few distinct values: 20 tenants gives `Index Searches: 21`, and 200,000 gives `Index Searches: 1` and a read of every page. What a high-cardinality first column costs you is not the index, it is the skipping.',
  },

  {
    slug: 'sql-search-stemmed-lexemes',
    title: 'The search that misses a word the row contains',
    category: 'sql',
    difficulty: 'easy',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      "Your search box is `WHERE body LIKE '%' || $1 || '%'`. A user searches for `running` and gets nothing, though one row reads \"She runs every morning before work\".",
      '',
      "Swap the predicate for `to_tsvector('english', body) @@ plainto_tsquery('english', $1)` and the same search finds it.",
      '',
      'Full-text search is not storing the words in that row. What is it storing instead?'
    ),
    graderConfig: {
      accept: [
        'lexemes',
        'stemmed lexemes',
        'normalised lexemes',
        'normalized lexemes',
        'word stems',
        'stems',
        'the stem of each word',
        'stemmed words',
      ],
      acceptPatterns: ['lexeme', '\\bstem(s|med|ming)?\\b'],
      nearMisses: {
        'the words':
          'Not as they are written. `runs` and `running` have to arrive at the same entry for this to work.',
        tokens:
          'A token is what the parser hands over. Something is done to it before it is stored.',
        'the whole string':
          'The original text is not in there at all, which is why searching it never had to be.',
        keywords:
          'Close in spirit. Postgres has a specific name for the normalised form it stores.',
      },
      hints: [
        'Both `runs` and `running` have to reach the same entry, or this could not work.',
        'What is stored is not English. Words are cut back to a common root and the useless ones are dropped.',
      ],
    },
    canonicalAnswer: 'Stemmed lexemes, with stop words removed.',
    solution: md(
      'Lexemes: normalised, stemmed words with stop words removed.',
      '',
      "`to_tsvector('english', 'She runs every morning before work')` gives `'everi':3 'morn':4 'run':2 'work':6`. Six words in, four lexemes: `she` and `before` are stop words and drop out. A search for `running` normalises to `run` too, so the two meet in the middle."
    ),
    explanation:
      "Full-text search does not store your text, it stores what your text reduces to. The English configuration folds case, stems each word to a root and discards stop words, and the query goes through the same reduction, which is how `running` and `runs` meet at `run` when `LIKE '%running%'` never could. That normalisation costs you a class of search: `plainto_tsquery('english', 'the')` returns an empty query, so a user searching for a stop word matches nothing at all. SQLite's FTS5 does none of this unless you build the table with `tokenize = porter`.",
  },

  {
    slug: 'sql-search-tsvector-tsquery',
    title: 'operator does not exist: tsvector @@ tsvector',
    category: 'sql',
    difficulty: 'easy',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'You wrote the search predicate as:',
      '',
      code('sql', "WHERE to_tsvector('english', body) @@ to_tsvector('english', $1)"),
      '',
      'and Postgres refuses it with `operator does not exist: tsvector @@ tsvector`.',
      '',
      'The left side is right. What has to produce the right side?'
    ),
    graderConfig: {
      accept: [
        'plainto_tsquery',
        'websearch_to_tsquery',
        'to_tsquery',
        'phraseto_tsquery',
        'a tsquery',
        'tsquery',
      ],
      acceptPatterns: ['ts_?query'],
      nearMisses: {
        to_tsvector:
          '`@@` wants a document on one side and a query on the other. That is the document side again.',
        plainto_tsvector:
          'No such function. The query side is a different type, not a different spelling.',
        'cast it to text': 'The types are the point. Naming a different one does not resolve it.',
      },
      hints: [
        '`@@` takes two different types. Both sides of yours are the same one.',
        'The left side is the document. The right side is the question being asked of it.',
        'There is a family of functions that turn text into the query type. `plainto_` is the plain one.',
      ],
    },
    canonicalAnswer:
      'plainto_tsquery, or websearch_to_tsquery for raw user input. The right side has to be a tsquery.',
    solution: md(
      code('sql', "WHERE to_tsvector('english', body) @@ plainto_tsquery('english', $1)"),
      '',
      '`to_tsvector` builds documents; the `..._tsquery` family builds queries. `to_tsquery` takes a hand-written expression with `&`, `|` and `!`, `plainto_tsquery` takes plain text and ANDs it together, and `websearch_to_tsquery` takes anything a user typed.'
    ),
    explanation:
      '`@@` pairs a `tsvector` with a `tsquery`, in either order, and is not defined for two of the same type: the document and the question are different things and Postgres will not guess which you meant. Both sides go through the same normalisation, which is the part that makes the match work at all. On user input, reach for `websearch_to_tsquery`, because it never raises a syntax error, whereas `to_tsquery` will reject a search box containing a stray quote and hand your users a 500.',
  },

  {
    slug: 'sql-search-rank-vs-match',
    title: 'Four thousand matches in table order',
    category: 'sql',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'Your search endpoint filters with `@@` and returns 4,000 rows for a common word, in whatever order the table handed them over. The filter is correct. The first page is useless.',
      '',
      '`@@` will not fix this. Say what it decides and what it cannot, and name what you add to get the good matches first.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'boolean',
            'true or false',
            'yes or no',
            'whether',
            'matches or not',
            'in or out',
            'a filter',
            'filter',
            'membership',
            'binary',
            'no score',
            'no ordering',
            'equally',
          ],
          missingFeedback:
            'What does `@@` return, and how much can a value of that type say about 4,000 rows?',
        },
        {
          synonyms: [
            'ts_rank',
            'rank',
            'ranking',
            'order by',
            'relevance score',
            'score',
            'sort by',
          ],
          missingFeedback:
            'Something has to turn 4,000 equal matches into a first page. Name the function.',
        },
      ],
      hints: [
        'Ask what type `@@` returns, and how many distinct values that type has.',
        'Everything that passed the filter passed it equally. Nothing in the filter separates them.',
        'Postgres has a function that scores a `tsvector` against a `tsquery`. Its name starts with `ts_`.',
      ],
    },
    canonicalAnswer:
      '`@@` decides one thing: whether the document matches the query at all. It is boolean, so all 4,000 rows are exactly as matched as each other and it has no opinion about which is better. Ranking is a separate step: ts_rank (or ts_rank_cd, which also weighs how close the matched lexemes sit) scores each surviving row, and you ORDER BY that score and LIMIT it.',
    solution: md(
      '- **`@@` matches.** It returns a boolean, so every row that passed passed identically. It cannot order anything.',
      '- **`ts_rank` ranks.** It scores a `tsvector` against a `tsquery`, and you `ORDER BY` that and `LIMIT`.',
      '',
      '`ts_rank_cd` is the variant that also weighs how close the matched lexemes sit to each other.'
    ),
    explanation:
      'Matching and ranking are two questions, and Postgres keeps them apart on purpose. `@@` is answered straight from the GIN index and throws away almost everything cheaply; ranking then reads the `tsvector` of every surviving row, which the docs call out as expensive and I/O bound. Filter hard first and rank the survivors, never the other way round. If titles should count for more than bodies, that decision is made with `setweight` when the `tsvector` is built, not at ranking time.',
  },

  {
    slug: 'sql-search-gin-index',
    title: 'The index that was created and never used',
    category: 'sql',
    difficulty: 'easy',
    relevance: 'foundational',
    type: 'short-text',
    prompt: md(
      'The `@@` predicate is right, and the plan is a `Seq Scan` over 2 million rows. So you index the expression:',
      '',
      code('sql', "CREATE INDEX docs_body_idx ON docs (to_tsvector('english', body));"),
      '',
      'It is created without complaint. The plan is still a `Seq Scan`.',
      '',
      'What kind of index does that statement need to be?'
    ),
    graderConfig: {
      accept: ['gin', 'a gin index', 'using gin', 'gin index', 'an inverted index'],
      acceptPatterns: ['\\bgin\\b', 'inverted'],
      nearMisses: {
        'b-tree':
          'That is what you got by default, and it is why nothing changed. A B-tree sorts whole values; it cannot answer "which rows contain this lexeme".',
        btree:
          'That is the default you already have. A B-tree sorts whole values; it cannot answer "which rows contain this lexeme".',
        'a unique index': 'Uniqueness is not the problem. The access method is.',
        hash: 'A hash index answers equality on the whole value. The query asks about one lexeme inside it.',
      },
      hints: [
        'The index exists and is never chosen. The planner does not believe it can answer the question.',
        'A `tsvector` is a set of lexemes, and the query asks which rows contain one. Which access method is built for "contains"?',
        'Postgres calls it the preferred text-search index type.',
      ],
    },
    canonicalAnswer: 'GIN',
    solution: md(
      code('sql', "CREATE INDEX docs_body_idx ON docs USING GIN (to_tsvector('english', body));"),
      '',
      'Without `USING GIN` you get a B-tree, which is perfectly happy to be built over a `tsvector` and useless for `@@`.'
    ),
    explanation:
      '`CREATE INDEX` defaults to a B-tree, and `tsvector` has a B-tree operator class, so the statement succeeds and hands you an index that sorts whole vectors. `@@` never asks about a whole vector. It asks which rows contain a given lexeme, and that is what an inverted index is: one entry per lexeme, holding the list of rows it appears in. Postgres calls GIN the preferred text-search index type; GiST is the other option and is lossy, so it produces false matches that have to be rechecked against the table. SQLite has no equivalent index at all: FTS5 is a virtual table you write into alongside the real one and query with `MATCH`.',
  },

  {
    slug: 'sql-search-trigram',
    title: 'Typos and a fragment from the middle',
    category: 'sql',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'Two complaints about the same search box. Someone typing `recieve` finds nothing. And a support agent pasting a fragment of a product code, `%X47%`, waits nine seconds while the table is scanned.',
      '',
      'Full-text search answers neither: a misspelling does not stem to the right word, and a product code is not a word. Name what does answer both, and say why it can serve a pattern that starts with a wildcard when a B-tree cannot.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'trigram',
            'pg_trgm',
            'trgm',
            'gin_trgm_ops',
            'gist_trgm_ops',
            'three-character',
            'three character',
          ],
          missingFeedback:
            'Both complaints are about characters rather than words. What do you get if you chop every string into overlapping three-character slices?',
        },
        {
          synonyms: [
            'left-anchored',
            'not anchored',
            'no anchor',
            'no prefix',
            'anywhere in the string',
            'any position',
            'every position',
            'middle of the string',
            'from the middle',
            'also chopped',
            'chopped into',
            'extracted from the pattern',
            'every slice',
          ],
          missingFeedback:
            'A B-tree needs a known first character before it can descend. Say what a trigram index needs instead.',
        },
      ],
      hints: [
        'Neither complaint is about words. Both are about characters that are nearly right, or in an awkward place.',
        'Chop every string into overlapping three-character slices and store those. Now ask what a search for `%X47%` becomes.',
        'The index is not sorted by the string, so there is no first character for it to need.',
      ],
    },
    canonicalAnswer:
      'A trigram index: pg_trgm with gin_trgm_ops, which stores every overlapping three-character slice of every string. It answers the typo through similarity() and the % operator, and it answers %X47% because the pattern is chopped into slices too and looked up directly. The search string need not be left-anchored, because nothing is being descended into: the index is asked which rows contain these slices, wherever they sit.',
    solution: md(
      code(
        'sql',
        'CREATE EXTENSION pg_trgm;',
        'CREATE INDEX docs_body_trgm ON docs USING GIN (body gin_trgm_ops);'
      ),
      '',
      "That one index serves both: `body % $1` for the misspelling, and `body LIKE '%X47%'` for the fragment. A trigram index stores slices from every position, so the search string need not be left-anchored the way a B-tree requires."
    ),
    explanation:
      'A trigram index stores every overlapping three-character slice of a string, which changes the question from "where does this value sort" to "which rows contain these slices". Both symptoms fall out of that: a misspelling still shares slices with the correct spelling, which is exactly what `similarity()` counts, and a fragment from the middle is just another set of slices to look up. The `%` operator compares against `pg_trgm.similarity_threshold`, which defaults to 0.3, and that number is the whole quality of your fuzzy search, so measure it against real queries rather than accept it. A pattern too short to yield any trigram degenerates to a full index scan, which is why a two-character search box stays slow. SQLite reaches the same place through an FTS5 table built with `tokenize = trigram`, which makes `LIKE` and `GLOB` indexed.',
  },

  {
    slug: 'sql-read-join-condition',
    title: "Somebody else's report query",
    category: 'sql',
    difficulty: 'medium',
    relevance: 'daily',
    tags: ['reading'],
    type: 'explain',
    prompt: md(
      'Postgres. You are reviewing this and have never seen it before:',
      '',
      code(
        'sql',
        'SELECT c.name, count(o.id) AS paid_orders',
        'FROM customers c',
        "LEFT JOIN orders o ON o.customer_id = c.id AND o.status = 'paid'",
        'GROUP BY c.name',
        'ORDER BY c.name;'
      ),
      '',
      'In one sentence: which customers come back, and what is the number beside each one?'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'every customer',
            'all customers',
            'all the customers',
            'including customers',
            'even customers',
            'even the ones',
            'even those',
            'zero',
            'none',
            'no paid',
            'without any',
            'whether or not',
          ],
          missingFeedback:
            'Which rows does the left side keep? Say what happens to a customer with no paid order.',
        },
        {
          synonyms: ['paid'],
          missingFeedback: 'The count is not of all their orders. Which ones does it count?',
        },
      ],
      hints: [
        'A condition in `ON` is part of the join. A condition in `WHERE` is applied after the join has happened.',
        'A `LEFT JOIN` keeps every row on the left whatever the `ON` condition decides.',
        'So a customer with no paid order still comes back, and `count(o.id)` counts nothing for them: 0.',
      ],
    },
    canonicalAnswer:
      'Every customer comes back, including the ones with no paid orders at all, and the number counts only their paid orders, so it is zero for those.',
    solution: md(
      'Every customer, with a count of their paid orders. Three customers, where only Dana has a paid order:',
      '',
      code(
        'text',
        ' name  | paid_orders',
        '-------+-------------',
        ' Dana  |           1',
        ' Omar  |           0',
        ' Sam   |           0'
      ),
      '',
      "Move `o.status = 'paid'` into a `WHERE` and only Dana comes back."
    ),
    explanation:
      "The `ON` clause decides which rows on the right are allowed to match; the `LEFT` decides that a row on the left survives regardless. So an extra condition in `ON` narrows the matching without ever dropping a customer, which is exactly what a report like this wants. The same condition in `WHERE` is applied after the join, when the unmatched customers already have `NULL` for every `o` column, and `NULL = 'paid'` is not true, so they are filtered out and the `LEFT JOIN` quietly becomes an inner one. The count is worth reading too: `count(o.id)` counts non-null values, giving 0 for a customer with no match, while `count(*)` counts rows and would report 1 for the same customer.",
  },

  {
    slug: 'sql-in-list-empty',
    title: 'The filter with nothing ticked',
    category: 'sql',
    difficulty: 'medium',
    relevance: 'daily',
    tags: ['reading'],
    type: 'short-text',
    prompt: md(
      'Postgres. The endpoint builds its `IN` list from whatever the user ticked:',
      '',
      code(
        'js',
        "const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');",
        'const sql = `SELECT id, title FROM books WHERE id IN (${placeholders})`;',
        'const { rows } = await db.query(sql, ids);'
      ),
      '',
      'The user unticks everything, so `ids` arrives as `[]`. What does the database do with that?'
    ),
    graderConfig: {
      accept: [
        'a syntax error',
        'syntax error',
        'it throws a syntax error',
        'it rejects it as a syntax error',
        'the statement fails with a syntax error',
      ],
      acceptPatterns: ['syntax\\s*error'],
      nearMisses: {
        'it returns no rows':
          'Postgres never gets as far as matching. `IN ()` is not an empty set, it is invalid syntax, and the statement is rejected before any row is looked at.',
        'no rows':
          'Postgres never gets as far as matching. `IN ()` is not an empty set, it is invalid syntax, and the statement is rejected before any row is looked at.',
        'an empty array':
          'That is what the endpoint returns on a good day. Look at the SQL string this builds when `ids` is empty.',
        'it returns every row':
          'An empty `IN` list is not a missing filter either. The statement does not run at all.',
      },
      hints: [
        'Write out the SQL string this builds when `ids` is empty, then read that.',
        'Postgres receives `SELECT id, title FROM books WHERE id IN ()`.',
        'It rejects it: `syntax error at or near ")"`. Guard the empty case, or pass an array to `= ANY($1)`.',
      ],
    },
    canonicalAnswer: 'a syntax error',
    solution: md(
      code(
        'text',
        'SELECT id, title FROM books WHERE id IN ()',
        'ERROR:  syntax error at or near ")"'
      ),
      '',
      'One parameter holding the whole array has no such shape, and matches nothing when the array is empty:',
      '',
      code('js', "await db.query('SELECT id, title FROM books WHERE id = ANY($1)', [ids]);")
    ),
    explanation:
      'An empty `IN` list is a hole in the SQL grammar rather than a filter that matches nothing, and the two engines this project uses disagree about it in the worst way: Postgres 18 rejects `IN ()` with `syntax error at or near ")"`, while SQLite accepts it and returns zero rows. So the same builder is a 500 on one engine and a silently empty page on the other, and neither is what "nothing is ticked" usually means, which is either every row or none by intent rather than by accident. Decide that case in the application, before any SQL is built. `= ANY($1)` avoids the whole shape by passing one array parameter instead of a generated list, and it matches nothing for an empty array without a syntax error.',
  },

  // Storing a thing rather than querying it. Neither rep below is about a
  // particular database: a copied column and an embedded list are the same two
  // decisions whether the row is a row or a document.

  {
    slug: 'sql-copied-column-drift',
    title: 'The name that stayed behind',
    category: 'sql',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'The orders table carries a `customer_name` column, copied from `customers` at checkout so the orders list needs no join. A customer changes their surname. The customer page shows the new name and every order they have ever placed still shows the old one.',
      '',
      'Say what has to be decided before you can call that a bug, and what each answer costs you.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'at the time',
            'point in time',
            'historical',
            'snapshot',
            'as it was',
            'record of',
            'deliberate',
            'depends',
            'intended',
            'cache',
            'copy of the current',
          ],
          missingFeedback:
            'There are two different things that column could be. Name the one that makes the old orders correct.',
        },
        {
          synonyms: [
            'update',
            'keep them in sync',
            'sync',
            'rewrite',
            'backfill',
            'every order',
            'every copy',
            'rename',
            'name it',
            'join',
          ],
          missingFeedback: 'Say what the other answer commits you to doing on every name change.',
        },
      ],
      hints: [
        'An invoice printed last year is not wrong because somebody changed their name since.',
        'One of the two answers turns every customer update into a write across the orders table.',
      ],
    },
    canonicalAnswer:
      'Decide whether that column is the name as it was at the time of the order or a cache of the current name. As a snapshot it is correct and the column should say so, so nothing has to change except the name of the column. As a cache it is stale, and keeping it right means every write that changes a customer name has to update every order that copied it, which is the cost you took on when you removed the join.',
    solution: md(
      'Two different columns wear the same name here.',
      '',
      '- **A snapshot**: the name as it was at checkout, which is what an invoice needs. It is correct, and calling it `customer_name_at_order` stops the next reader filing this as a bug.',
      '- **A cache**: a copy of the current name, kept to avoid a join. Then it is stale, and every name change owes a write to every order that copied it.',
      '',
      'The copy is not the mistake. Not deciding which one it is, is.'
    ),
    explanation:
      'Copying a value out of one table into another buys a read that needs no join, and the price is that the value now exists in two places and something has to keep them agreeing. That price is the deal rather than a defect, but it is only worth paying deliberately: a copy nobody decided about drifts, and then nobody can say whether the old value is a stale cache or the historical record. The question that settles it is whether the copy is meant to change when the original does. Where the answer is no, say so in the column name, because the only thing worse than a denormalised column is one whose meaning has to be reverse-engineered from a bug report.',
  },

  {
    slug: 'sql-embedded-list-grows',
    title: 'One row, forty thousand reviews',
    category: 'sql',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A product carries its reviews as a JSON array in one column, so the product page is a single read with no join. A year in, the busiest product holds 40,000 reviews in that array, the page shows ten of them, and it is slow.',
      '',
      'Say why one row got slow, and what the fix has to change about the shape.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'whole',
            'entire',
            'all of it',
            'all of them',
            'every review',
            'reads it all',
            'rewrite',
            'rewrites',
            'the full array',
            'all 40,000',
            'all 40000',
            'megabytes',
          ],
          missingFeedback:
            'The row is the unit the database reads and writes. Say what that means for a page showing ten reviews.',
        },
        {
          synonyms: [
            'own table',
            'separate table',
            'their own rows',
            'own rows',
            'separate rows',
            'child table',
            'move them out',
            'out of the row',
            'paginate',
            'bounded',
            'bound',
            'limit',
          ],
          missingFeedback: 'What has to stop living inside the product?',
        },
      ],
      hints: [
        'Ask what the database has to read to hand you that one row, and what it has to write when one review is edited.',
        'Ten reviews are wanted and 40,000 are paid for. The shape decides that, not the query.',
      ],
    },
    canonicalAnswer:
      'The row is the unit, so reading the product reads all 40,000 reviews to display ten, and editing one review rewrites the whole array. The fix is to stop keeping an unbounded list inside the thing it hangs off: reviews get their own rows, the page asks for the ten it wants, and anything the product genuinely needs at hand stays as a bounded summary like a count and an average.',
    solution: md(
      'Because a row is read and written whole, so the page pays for 40,000 reviews to show ten, and one edit rewrites the array.',
      '',
      '- **Reviews get their own rows**, keyed by product, ordered and paged like anything else.',
      '- **The product keeps a bounded summary**: a count, an average, maybe the latest three.',
      '',
      'Embedding is for a list with a ceiling. This one never had one.'
    ),
    explanation:
      'Embedding a list inside the thing it belongs to buys one read and charges for the whole list on every read and every write, which is a good trade exactly while the list is small and bounded. Nothing warns you when it stops being either, because the query still touches one row and the plan still looks perfect: the cost is in the size of that row rather than in the number of them. The question to ask when choosing the shape is not how big this list is today, it is whether anything stops it growing. Where the answer is nothing, it wants its own rows, and the parent keeps a summary that does have a ceiling.',
  },

  // Two writers, one row. Both reps below are read at `databases/transactions-and-acid.md`:
  // the first is what a write does about a concurrent one, the second is what the
  // database does when you ask it to handle that for you.

  {
    slug: 'sql-optimistic-update-zero-rows',
    title: 'The update that changed nothing',
    category: 'sql',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'An edit form read a document, the user changed the title, and the save ran:',
      '',
      code(
        'sql',
        'UPDATE documents',
        "SET title = 'Q3 plan', version = version + 1",
        'WHERE id = 42 AND version = 7;'
      ),
      '',
      'It reports 0 rows affected, and row 42 is still there.',
      '',
      'Say what happened, and what the handler should do with that 0.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'someone else',
            'somebody else',
            'another',
            'concurrent',
            'changed since',
            'in between',
            'between the read',
            'no longer 7',
            'not 7',
            'stale',
            'moved on',
            'already updated',
          ],
          missingFeedback:
            'The row exists, so `id = 42` matched. Say what the other half of the `WHERE` did not.',
        },
        {
          synonyms: [
            'conflict',
            '409',
            'lost update',
            'not a success',
            'not success',
            'reject',
            'refuse',
            'stale write',
          ],
          missingFeedback: 'Zero rows is a verdict. Say which one.',
        },
        {
          synonyms: [
            're-read',
            'reread',
            're read',
            'reload',
            'the user',
            'merge',
            'do not retry',
            "don't retry",
            'not blindly',
          ],
          missingFeedback: 'The save cannot go through as written. Say what happens next.',
        },
      ],
      hints: [
        'The row is there, so `id = 42` matched. Look at the rest of the `WHERE`.',
        'The form read version 7. Something has written to the row since.',
        'Zero rows is the check firing rather than a bug. Decide what the person who pressed save sees.',
      ],
    },
    canonicalAnswer:
      'Somebody else wrote to the row between the read and the save, so its version is no longer 7 and the WHERE matched nothing. The 0 is not a missing row, it is a detected conflict: the write was built on a version that has moved on, and applying it would have thrown that other change away. So the handler treats it as a conflict rather than a success, re-reads the row and puts the choice to the user, instead of running the same update again with the current version, which is the lost update the check exists to catch.',
    solution: md(
      'The row moved on between the read and the save.',
      '',
      '- **What the 0 means**: `version` is no longer 7, so nothing matched. The write was built on a document that no longer exists in that form.',
      '- **What to do**: treat it as a conflict. Re-read, show what changed, let the user decide. Re-running the update with the current version is the lost update you were preventing.'
    ),
    explanation:
      'This is optimistic locking, and it works by carrying what you read back into the write. A read-then-write is not a write: the gap between the two can hold another transaction, and on a form somebody left open at lunch it can hold an afternoon, so a transaction around the `UPDATE` alone protects nothing. Putting the version in the `WHERE` turns a lost update into zero rows affected, which is the same event, reported. The pessimistic alternative, `SELECT ... FOR UPDATE`, holds the row instead, and can only work while the read and the write sit inside one transaction. Two things to know before leaning on this: the row count is the whole signal, so an ORM call that discards it takes the mechanism away, and zero rows does not distinguish a changed row from a deleted one, which is why the conflict handler re-reads.',
  },

  {
    slug: 'sql-serializable-needs-retry',
    title: 'The isolation level that started returning 500s',
    category: 'sql',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A report kept reading half-applied data, so its transaction was raised from Read Committed to Serializable. The report is right now, and the endpoint fails a few times a day with:',
      '',
      code(
        'text',
        'ERROR: could not serialize access due to read/write dependencies',
        '  among transactions'
      ),
      '',
      'Say why raising the level produced errors, and what the change was missing.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'abort',
            'rolls back',
            'roll back',
            'rollback',
            'refuse',
            'reject',
            'serialization failure',
            'serialisation failure',
            'detect',
            'kills one',
            'doing its job',
            'working',
          ],
          missingFeedback: 'What does Serializable do when it cannot order two transactions?',
        },
        {
          synonyms: ['retry', 'retries', 'rerun', 're-run', 'run it again', 'try again', 'repeat'],
          missingFeedback:
            'Postgres says applications at this level must be prepared to do one thing.',
        },
        {
          synonyms: [
            'whole transaction',
            'entire transaction',
            'from the start',
            'from the beginning',
            'not the statement',
            'not just the statement',
            'side effect',
            'outside the database',
            'external',
            'idempotent',
          ],
          missingFeedback: 'Say what the unit of that is, and what it rules out doing inside one.',
        },
      ],
      hints: [
        'The error arrived because the database started noticing something it used to let through.',
        'Postgres aborts one of two conflicting transactions rather than allowing the anomaly.',
        'The missing half is a retry, and the unit is the transaction rather than the statement that failed.',
      ],
    },
    canonicalAnswer:
      'Serializable does not make the concurrency go away, it changes how the database reports it: where two transactions interleaved in a way no serial order could produce, Postgres aborts one instead of letting the wrong answer through, so the error is the guarantee working. Raising the level is therefore half the change. The other half is a retry the application has to write, rerunning the whole transaction from the start rather than the statement that failed, which is only safe once anything with an effect outside the database has been moved out of it.',
    solution: md(
      'Serializable trades a rare wrong answer for a rare abort, and the abort is yours to handle.',
      '',
      '- **Why the 500**: two transactions interleaved in a way no serial order could produce, so Postgres aborted one.',
      '- **What is missing**: a retry that reruns the whole transaction, with any non-database effect moved outside it first.'
    ),
    explanation:
      'Isolation levels are named after the anomalies they forbid, and the strong ones forbid them by refusing transactions rather than by making conflicts impossible. The Postgres documentation says the same thing about both levels above Read Committed: applications using them "must be prepared to retry transactions due to serialization failures". Shipping the level without that retry converts a rare wrong answer into a rare 500, which is exactly the trade made here and not usually the one intended. The unit of retry is the whole transaction, because a serialization failure invalidates everything the transaction read, not only the statement that reported it. That is also why an email or a charge inside the transaction has to come out first: the retry does it again.',
  },
];
