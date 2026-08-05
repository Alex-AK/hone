import { code, codeProblem, md, type ProblemDraft, typeProblem } from './types';

/**
 * ORMs, judged by what they do rather than by what they promise.
 *
 * Six workouts run against one (`product-search-drizzle`, `records-sorting-drizzle`,
 * `slow-list-endpoint-kysely`, `orders-report-typeorm`, `article-tags-typeorm`,
 * `help-board-graphql`) and nothing in the problem set practised them.
 *
 * Every behavioural claim here was produced by running the library, not recalled,
 * and the version is named wherever it is asserted: typeorm 1.1.0, drizzle-orm
 * 0.45.2, kysely 0.29.4, drizzle-kit 0.31.10, all against better-sqlite3 12.11.1.
 * These libraries differ from each other and from their own last release, so a
 * bare "ORMs do X" is how a rep rots.
 *
 * Injection is not here: `security/parameterised-queries.md` owns it, including
 * `sql` against `sql.raw`. What N+1 is belongs to `databases/n-plus-one.md`, so
 * the reps that touch it are about spotting it in an ORM's own API.
 */
export const ormProblems: ProblemDraft[] = [
  {
    slug: 'orm-save-undefined-vs-null',
    title: 'Archiving that would not clear the date',
    category: 'orm',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'short-text',
    prompt: md(
      'Archiving an article is meant to take it out of the review rota by clearing `reviewDueAt`:',
      '',
      code('ts', "await articles.save({ id: 7, status: 'archived', reviewDueAt: undefined });"),
      '',
      'The status changes. The review date keeps the value it had, and the article keeps turning up in the Monday reminder. typeorm 1.1.0 logs one `UPDATE`, and it sets `status` only.',
      '',
      'What do you pass as `reviewDueAt` instead?'
    ),
    graderConfig: {
      accept: ['null', 'reviewdueat: null', 'reviewduedat: null', 'pass null'],
      acceptPatterns: ['\\bnull\\b'],
      nearMisses: {
        undefined: 'That is what it already has, and it is why the column was left alone.',
        'an empty string':
          'That writes an empty string into a nullable column, so the date is gone and the column is not empty. There is a value that means "no date".',
        'delete the property':
          'A missing property and an undefined one are the same thing to `save`. You have to say what the column should hold.',
        '0': 'The column holds a date string. Nulling it is what "no review due" means.',
      },
      hints: [
        '`save` merges what you hand it onto the row it read. Ask what an undefined property tells it.',
        'An undefined property is one `save` was not asked about, so it never reaches the `SET` clause.',
        'The column is nullable. Say so explicitly.',
      ],
    },
    canonicalAnswer: 'null',
    solution: code('ts', "await articles.save({ id: 7, status: 'archived', reviewDueAt: null });"),
    explanation:
      '`save` reads the row, merges your object onto it and writes the difference, and an undefined property is one it was not asked about rather than one you want cleared. `null` is a value, so it lands in the `SET` clause and the column is nulled. The two look identical in JavaScript at the call site, which is what makes this ship: `{ reviewDueAt: body.reviewDueAt }` clears the column when the client sends `null` and silently keeps the old date when the client omits the field. Decide which one your API means before the object reaches the repository, because the ORM will not ask.',
  },

  {
    slug: 'orm-relation-array-replaces-the-set',
    title: 'Adding one tag removed three',
    category: 'orm',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'short-text',
    prompt: md(
      'An article carries three tags: `beta`, `api` and `billing`. Putting `search` on it is written as:',
      '',
      code('ts', 'await articles.save({ id: 1, tags: [searchTag] });'),
      '',
      'typeorm 1.1.0 logs one `INSERT INTO "article_tags"` and one `DELETE FROM "article_tags"`.',
      '',
      'Which tags does the article carry afterwards?'
    ),
    graderConfig: {
      accept: [
        'search',
        'only search',
        'just search',
        'search only',
        'the search tag',
        'only the search tag',
        'just the search tag',
        'one: search',
      ],
      acceptPatterns: ['^\\W*(only |just )?(the )?`?search`?( tag)?\\W*$'],
      nearMisses: {
        'beta, api, billing, search':
          'That is what an add would do. The array you hand `save` is the whole set, not an addition to it, so the `DELETE` in the log took the other three off.',
        'beta, api, billing':
          'Those are the ones that went. `save` wrote the array it was given as the whole tag list for that article.',
        'all four': 'The `DELETE` went somewhere. Count what is left after it.',
      },
      hints: [
        'Two statements went out, and one of them was a `DELETE`. Work out what it deleted.',
        'A relation property on `save` is a statement about the whole relation, not an instruction to append.',
        'The article ends up with exactly the tags in the array you passed.',
      ],
    },
    canonicalAnswer: 'Only search.',
    solution: md(
      'Only `search`. `beta`, `api` and `billing` lost their join rows.',
      '',
      'To add one, load the tags the article already has and push onto them:',
      '',
      code(
        'ts',
        'const article = await articles.findOne({ where: { id: 1 }, relations: { tags: true } });',
        'article.tags.push(searchTag);',
        'await articles.save(article);'
      )
    ),
    explanation:
      'A relation array handed to `save` is the state you are asserting, not a delta, so TypeORM diffs it against the join rows that exist and writes both the inserts and the deletes needed to make the table match. That is the right behaviour for a data mapper and the wrong mental model for anybody thinking in terms of "add a tag". Leaving `tags` off the object entirely is different again and safe: a relation `save` was not handed is one it does not touch. When you only want one join row, `createQueryBuilder().relation(Article, "tags").of(1).add(tag)` writes it without loading the article or its other tags at all.',
  },

  {
    slug: 'orm-update-all-undefined',
    title: 'The PATCH that never reached the database',
    category: 'orm',
    difficulty: 'easy',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'A PATCH handler passes the body straight through:',
      '',
      code('ts', 'await articles.update(id, { title: body.title, status: body.status });'),
      '',
      'It works while every request sets at least one of the two. A request that sets neither fails, and the query log for it is empty.',
      '',
      'In one line: what does typeorm 1.1.0 do when every value in that object is `undefined`?'
    ),
    graderConfig: {
      accept: [
        'it throws',
        'throws',
        'throws an error',
        'it throws an error',
        'updatevaluesmissingerror',
        'it throws updatevaluesmissingerror',
      ],
      acceptPatterns: ['\\bthrows?\\b', 'UpdateValuesMissingError'],
      nearMisses: {
        nothing:
          'It does not quietly do nothing. With no value left to set there is no `SET` clause to build, and it refuses rather than sending an `UPDATE` with an empty one.',
        'it updates nothing':
          'It does not quietly do nothing. With no value left to set there is no `SET` clause to build, and it refuses rather than sending an `UPDATE` with an empty one.',
        'affected: 0':
          'That is what `update` reports for an id no row has. This one never reaches the database at all, which is why the log is empty.',
        'it sets the columns to null':
          'Undefined and null are different to TypeORM: null would be written, and undefined leaves the column out of the statement entirely.',
      },
      hints: [
        'The log is empty, so nothing was sent. Ask what happened before anything could be.',
        'Every value is undefined, so there is nothing to put in the `SET` clause.',
        'TypeORM refuses to build that statement.',
      ],
    },
    canonicalAnswer: 'It throws UpdateValuesMissingError.',
    solution: md(
      'It throws:',
      '',
      code(
        'text',
        'UpdateValuesMissingError: Cannot perform update query because update values are not defined.'
      ),
      '',
      'Build the object from the fields the request actually sent, and skip the write when there are none.'
    ),
    explanation:
      '`update` fires a bare `UPDATE` and builds the `SET` clause from what you pass, so an object whose values are all undefined leaves nothing to set and TypeORM refuses it rather than sending a statement that cannot mean anything. The trap is that the same handler passes every test where the body has a field in it. `save` behaves differently on the same object and is not the fix: it reads the row, finds nothing to change and writes no `UPDATE`, so the request succeeds silently, which may or may not be what a PATCH with an empty body should do. That is a decision for the endpoint, not for the ORM.',
  },

  {
    slug: 'orm-aggregate-needs-raw',
    title: 'The count that is not on the entity',
    category: 'orm',
    difficulty: 'easy',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'The report wants a line count against each order:',
      '',
      code(
        'ts',
        'const rows = await orders',
        "  .createQueryBuilder('order')",
        "  .leftJoin('order.items', 'item')",
        "  .addSelect('COUNT(item.id)', 'itemCount')",
        "  .groupBy('order.id')",
        '  .getMany();',
        '',
        'rows[0].itemCount; // undefined'
      ),
      '',
      'The SQL typeorm 1.1.0 sends is right and the number is nowhere on the entity.',
      '',
      'Name the call to use instead of `getMany`.'
    ),
    graderConfig: {
      accept: ['getrawmany', 'getrawmany()', 'getrawandentities', 'getrawandentities()'],
      acceptPatterns: ['getRaw(Many|One|AndEntities)'],
      nearMisses: {
        getcount:
          '`getCount()` throws away your select list and runs one `COUNT` over the whole query. You want a number per order.',
        getmanyandcount:
          'That gives you the entities plus how many of them there are, which is paging. The per-order count is an aliased column.',
        'add itemCount as a column on the entity':
          'Then TypeORM would look for an `itemCount` column in the table and there is none. The value exists only in the result of this query.',
        getmany:
          'That is the call in the prompt, and it is the one dropping the alias. Ask for the rows the driver returned instead.',
      },
      hints: [
        'The alias is in the SQL and not on the object, so something between the two dropped it.',
        '`getMany` builds entities, and it can only fill properties the entity declares. An aliased aggregate is not one.',
        'Ask the builder for the rows as the driver returned them.',
      ],
    },
    canonicalAnswer: 'getRawMany',
    solution: md(
      code('ts', "  .groupBy('order.id')", '  .getRawMany();'),
      '',
      'Every alias comes back as a key, and nothing is turned into an entity. `getRawAndEntities()` gives you both halves when you need the entity as well.'
    ),
    explanation:
      '`getMany` hydrates entities, so it keeps the columns the entity declares and discards everything else in the result, including an aggregate you aliased yourself. Nothing warns you: the SQL is correct, the query runs, and the property is `undefined`, which reads as a data problem rather than a mapping one. `getRawMany` returns the driver rows untouched, so the alias is there and so is every value as the driver typed it, which for SQLite and Postgres means `COUNT` and `SUM` can arrive as strings and need converting. That is the trade the raw call makes: you get the columns you asked for and lose the mapping that would have parsed them.',
  },

  {
    slug: 'orm-kysely-where-dropped',
    title: 'The filter that is right there and did nothing',
    category: 'orm',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'A list endpoint applies a filter when one was asked for:',
      '',
      code(
        'ts',
        "const q = db.selectFrom('products').selectAll();",
        "if (maxPrice) q.where('price', '<=', maxPrice);",
        'const rows = await q.execute();'
      ),
      '',
      '`maxPrice` is 150 and all four products come back. kysely 0.29.4 compiles the query as `select * from "products"`, with no parameters.',
      '',
      'Say why the filter is missing from the SQL, and what to change.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'immutable',
            'returns a new',
            'new builder',
            'new query',
            'a copy',
            'return value',
            'discarded',
            'dropped',
            'ignored',
            'thrown away',
            'does not mutate',
            'does not modify',
            'unchanged',
          ],
          missingFeedback:
            'The `if` ran, so `.where()` was called. Ask what the call gave back, and what happened to it.',
        },
        {
          synonyms: [
            'assign',
            'reassign',
            'assignment',
            'q =',
            'let q',
            'use the result',
            'use the return',
            'keep the result',
            'chain',
            'chained',
            'build the condition',
          ],
          missingFeedback:
            'Name the fix as code. The value the call returned has to become the query you execute.',
        },
      ],
      hints: [
        'The `if` ran. Compare the compiled SQL against the query you built and ask which object was executed.',
        'A Kysely builder is immutable: every method hands back a new one and leaves the old one alone.',
        '`q` is still the unfiltered query, because nothing assigned the filtered one back to it.',
      ],
    },
    canonicalAnswer:
      'Kysely builders are immutable, so .where() returns a new builder rather than changing q, and the return value here is discarded. The q that gets executed is the unfiltered one. Assign it back: let q = ...; if (maxPrice) q = q.where("price", "<=", maxPrice).',
    solution: md(
      code(
        'ts',
        "let q = db.selectFrom('products').selectAll();",
        "if (maxPrice) q = q.where('price', '<=', maxPrice);",
        'const rows = await q.execute();'
      ),
      '',
      'Compiled, that is `select * from "products" where "price" <= ?` with `[150]`, and one row comes back.'
    ),
    explanation:
      'Every Kysely method returns a new builder and leaves the one you called it on untouched, so a `.where()` whose return value goes nowhere is a no-op that reads exactly like the mutating version. Nothing errors and nothing warns: you get the whole table, which looks like a data problem rather than a line of code that did nothing. Drizzle has the opposite hazard from the same design question, because there `.where()` does mutate, and a second call replaces the first instead of combining them. Knowing which of the two you are holding is the difference, and compiling the query without running it is how you check.',
  },

  {
    slug: 'orm-ddl-lock-queue',
    title: 'The migration that had not started yet',
    category: 'orm',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'Postgres. A release adds a column to `orders`. One report query has been running for four minutes, so the `ALTER TABLE` is sitting behind it waiting for its lock, and it has modified nothing.',
      '',
      'Within seconds, every request that reads `orders` is timing out too, including the ones that were being served happily a moment earlier.',
      '',
      'Say why plain readers are stuck behind a statement that has not started, and what you set before the DDL so this cannot happen.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'queue',
            'queues',
            'queued',
            'behind it',
            'in line',
            'lock request',
            'the request',
            'waiting request',
            'ahead of them',
            'first in',
            'fifo',
          ],
          missingFeedback:
            'The migration holds no lock yet. Say what its outstanding request does to a reader that arrives after it.',
        },
        {
          synonyms: ['lock_timeout', 'lock timeout', 'locktimeout'],
          missingFeedback:
            'Name the setting that makes a statement give up rather than wait for a lock it cannot have.',
        },
      ],
      hints: [
        'Nothing has been altered. The migration is waiting, and waiting is the part that hurts.',
        'Ask what happens to a `SELECT` that arrives while a stronger lock request is already in the queue.',
        '`statement_timeout` bounds the work. You want the one that bounds the wait.',
      ],
    },
    canonicalAnswer:
      'Lock requests queue. The ALTER is waiting for an ACCESS EXCLUSIVE lock, which conflicts with every other mode including the ACCESS SHARE a plain SELECT takes, and a reader arriving afterwards lines up behind that request instead of joining the compatible read that actually holds the table. Set lock_timeout before the DDL, so a migration that cannot take its lock straight away is refused rather than left waiting, and no queue forms behind it.',
    solution: md(
      'Because lock requests queue, and the queue is what turns a slow migration into an outage.',
      '',
      'Measured on PostgreSQL 17.10, one long read held open and one `SELECT count(*)` sent after the `ALTER`:',
      '',
      code(
        'text',
        'reader, nothing in the way                          1000 rows',
        'reader, alongside the long read                     1000 rows',
        'reader, after the ALTER queued behind that read     ERROR:  canceling statement due to lock timeout',
        'reader, same again but the ALTER SET lock_timeout   1000 rows  (the ALTER took the 55P03 instead)'
      ),
      '',
      "So the DDL goes out as `SET lock_timeout = '100ms';` and then the `ALTER`, and a release that cannot have the table right now fails fast and is retried."
    ),
    explanation:
      'An `ACCESS EXCLUSIVE` lock conflicts with every other mode, including the `ACCESS SHARE` that a bare `SELECT` takes, and Postgres does not let later requests overtake a waiting one. So a migration that is merely queued is already the incident: readers that would have been perfectly compatible with the transaction actually holding the table pile up behind the DDL instead, and the pile is what takes the API down. `lock_timeout` is the control, and it is the one that bounds the wait rather than the work: `statement_timeout` would let the queue form and then kill the migration halfway through it.',
  },

  {
    slug: 'orm-add-foreign-key-scan',
    title: 'The constraint that stopped every write',
    category: 'orm',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'Postgres. A migration adds a foreign key that should have been there from the start:',
      '',
      code(
        'sql',
        'ALTER TABLE order_items ADD CONSTRAINT order_items_order_id_fkey',
        '  FOREIGN KEY (order_id) REFERENCES orders (id);'
      ),
      '',
      'Both tables are large. The statement verifies every existing row before it returns, and it holds its lock on both tables for the whole scan, so writes to either one wait it out.',
      '',
      'Say what you add to the statement so the scan does not happen inside it, and what you run afterwards instead.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['not valid'],
          missingFeedback:
            'Name the option that adds the constraint without checking the rows that are already there.',
        },
        {
          synonyms: ['validate constraint', 'validate the constraint', 'validate'],
          missingFeedback:
            'The old rows still have to be checked at some point. Name the statement that does that checking.',
        },
      ],
      hints: [
        'Enforcing the rule from now on and proving it about the past are two different jobs.',
        'Postgres has an option for the first half that explicitly skips the scan.',
        'The second half takes a weaker lock than the first, which is the entire reason to split them.',
      ],
    },
    canonicalAnswer:
      'Add it NOT VALID, which skips the scan of the existing rows while still applying the constraint to every insert and update from that moment on. Then run ALTER TABLE order_items VALIDATE CONSTRAINT order_items_order_id_fkey as its own migration, which does the scan under a SHARE UPDATE EXCLUSIVE lock rather than blocking writers for the length of it.',
    solution: md(
      code(
        'sql',
        '-- Migration one: enforced immediately, no scan.',
        'ALTER TABLE order_items ADD CONSTRAINT order_items_order_id_fkey',
        '  FOREIGN KEY (order_id) REFERENCES orders (id) NOT VALID;',
        '',
        '-- Migration two, once the first is out: the scan, under a weaker lock.',
        'ALTER TABLE order_items VALIDATE CONSTRAINT order_items_order_id_fkey;'
      ),
      '',
      'Between the two, new rows are already covered. Only the history is unproven, and only until the second one runs.'
    ),
    explanation:
      '`ADD FOREIGN KEY` is already gentler than most DDL, taking a `SHARE ROW EXCLUSIVE` lock rather than `ACCESS EXCLUSIVE`, and taking it on the referenced table as well as the one being altered. What costs you is not the lock level but how long it is held, because the statement scans the table to prove the constraint about rows that already exist. `NOT VALID` is Postgres offering exactly that split: the documented behaviour is that the potentially lengthy scan is skipped while the constraint still applies to subsequent inserts and updates. `VALIDATE CONSTRAINT` then does the scan under a `SHARE UPDATE EXCLUSIVE` lock, which writers can work alongside.',
  },

  {
    slug: 'orm-not-null-on-a-full-table',
    title: 'The column that would not add itself',
    category: 'orm',
    difficulty: 'easy',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A migration adds a required column:',
      '',
      code('sql', 'ALTER TABLE people ADD COLUMN email text NOT NULL;'),
      '',
      'It ran clean against the local database. In staging, against PostgreSQL 18.3, it failed:',
      '',
      code('text', 'column "email" of relation "people" contains null values'),
      '',
      'Say why the same statement passed locally, and what sequence adds the column for real.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'empty',
            'no rows',
            'no data',
            'zero rows',
            'nothing in it',
            'no existing rows',
            'freshly created',
            'fresh database',
            'had no rows',
          ],
          missingFeedback:
            'The statement is the same in both places, so the difference is the table. What did staging have that your laptop did not?',
        },
        {
          synonyms: [
            'nullable',
            'without not null',
            'allow null',
            'backfill',
            'fill',
            'populate',
            'default',
            'then add the constraint',
            'add the constraint after',
            'three steps',
            'separate steps',
          ],
          missingFeedback:
            'The existing rows need a value before the constraint can be true. Name the steps that get them one.',
        },
      ],
      hints: [
        'The statement never changed. The table it ran against did.',
        'A `NOT NULL` column has to be true for rows that already exist, and there is no value for them.',
        'Add it nullable, give the existing rows a value, then add the constraint.',
      ],
    },
    canonicalAnswer:
      'The local table was empty, so there were no existing rows to violate NOT NULL and the constraint was trivially true. Staging had rows, and each one would need an email the statement does not supply. Add the column nullable, backfill a value for every row, then add the NOT NULL constraint as a separate step.',
    solution: md(
      code(
        'sql',
        'ALTER TABLE people ADD COLUMN email text;',
        "UPDATE people SET email = id || '@placeholder.invalid' WHERE email IS NULL;",
        'ALTER TABLE people ALTER COLUMN email SET NOT NULL;'
      ),
      '',
      'A `DEFAULT` on the add would also satisfy it in one statement, but only if every existing row genuinely should have that value.'
    ),
    explanation:
      'A constraint has to hold for the rows already in the table, and a bare `ADD COLUMN ... NOT NULL` gives them nothing, so the only database it passes on is one with no rows: your laptop, a fresh test database, a CI run that migrates before it seeds. That is what makes it a migration bug rather than a syntax error, because it passes everywhere you would notice it cheaply. The three-step shape is not ceremony, it is three different things happening: the column appears, the existing rows get a value, and only then does the rule start being enforced. The last step is also the expensive one, since Postgres scans the table to verify every row before it will accept the constraint.',
  },

  {
    slug: 'orm-save-reads-first',
    title: 'The SELECT nobody asked for',
    category: 'orm',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'One line, `await articles.save({ id: 7, status: "archived" })`, logged by typeorm 1.1.0:',
      '',
      code(
        'text',
        'SELECT "Article"."id", "Article"."slug", "Article"."title", "Article"."status", …',
        '  FROM "articles" "Article" WHERE "Article"."id" = 7',
        'BEGIN TRANSACTION',
        'UPDATE "articles" SET "status" = ? WHERE "id" = 7',
        'COMMIT'
      ),
      '',
      '`await articles.update(7, { status: "archived" })` logs the `UPDATE` and nothing else.',
      '',
      'Say what the `SELECT` is for, and name one thing `save` can do because of it that `update` cannot.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'reads the row',
            'read the row',
            'loads the row',
            'load the row',
            'reads the current',
            'the current row',
            'the stored row',
            'the row as it is',
            'what is stored',
            'what is already there',
            'compare',
            'compares',
            'diff',
            'merge',
            'merges',
            'work out what changed',
            'works out what changed',
            'which columns changed',
            'what actually changed',
            'insert or update',
            'whether the row exists',
          ],
          missingFeedback:
            'Nothing in the object said which columns are different from what is stored. Say where `save` gets that.',
        },
        {
          synonyms: [
            'only the columns',
            'columns that changed',
            'columns that moved',
            'just the changed',
            'subscriber',
            'listener',
            'afterupdate',
            'previous value',
            'previous row',
            'before and after',
            'the old value',
            'change log',
            'audit',
            'databaseentity',
            'updatedcolumns',
            'cascade',
            'relations',
            'decide whether to insert',
            'insert instead',
          ],
          missingFeedback:
            'Name something that read makes possible. A narrower `UPDATE`, a subscriber with a before value, a cascade: any one of them.',
        },
      ],
      hints: [
        '`save` was handed two properties and the `UPDATE` sets one. Ask how it knew.',
        'It has the row as it is stored and the object you handed it, so it can diff them.',
        'That diff is also what a subscriber reads: `event.updatedColumns` and `event.databaseEntity` both come from it.',
      ],
    },
    canonicalAnswer:
      'The `SELECT` loads the row as it is stored, so `save` can merge your object onto it and work out which columns actually changed. That is why the `UPDATE` sets `status` alone. It is also what an `afterUpdate` subscriber reads: the previous row and the list of columns that moved both come from that read, so a change log built on `save` has a before and after value.',
    solution: md(
      '- **What the `SELECT` is for**: `save` needs the row as it is stored, so it can decide whether this is an insert or an update and which columns are actually different.',
      '- **What it buys**: an `UPDATE` that sets only what changed, a subscriber that gets `databaseEntity` and `updatedColumns`, and cascades into relations. `update` has none of that, because it never read anything.'
    ),
    explanation:
      'This is the whole difference between the two calls, and it is a round trip per `save`. `save` is the data-mapper path: read, merge, diff, write, with the read paying for the narrow `UPDATE`, the subscriber events and the insert-or-update decision. `update` is a statement you asked for, sent as written, which is faster and blind. Neither is the default answer. A hot counter is `update` or `sql` with `views = views + 1`, because reading it first is both slower and a lost update waiting for a concurrent request; a write that anything else in the system reacts to is `save`, because the reaction needs the before value. Knowing which one a line is using is usually the first question when a query count looks wrong.',
  },

  {
    slug: 'orm-save-unknown-id-inserts',
    title: 'The archive that created a row',
    category: 'orm',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'Two ways to archive an article, both given an id no row has:',
      '',
      code(
        'ts',
        'await articles.update(999, { status: "archived" });   // resolves, affected: 0',
        'await articles.save({ id: 999, status: "archived" }); // ?'
      ),
      '',
      'typeorm 1.1.0. Say what the second one does.'
    ),
    graderConfig: {
      accept: [
        'it inserts a row',
        'inserts a row',
        'it inserts',
        'inserts',
        'insert',
        'it tries to insert a new row',
        'creates a row',
        'it creates a new row with id 999',
      ],
      acceptPatterns: ['\\b(inserts?|creates?)\\b', '\\bupsert'],
      closeSubstrings: {
        throw:
          'It does, where a `NOT NULL` column has nothing to write. That is the constraint refusing what `save` decided to do, and the branch it took is the interesting half.',
        error:
          'You get one where a `NOT NULL` column has nothing to write. That is the constraint refusing what `save` decided to do, and the branch it took is the interesting half.',
      },
      nearMisses: {
        nothing:
          '`update` is the one that quietly does nothing. `save` found no row to update, so it took the other branch.',
        'affected: 0':
          'That is the `update` result. `save` returns the entity, and it had to make one first.',
        'it updates nothing': '`save` did not update. Say what it did instead.',
      },
      hints: [
        '`save` reads the row before it writes. Ask what it does when the read comes back empty.',
        'It has a primary key and no row for it, so the update branch is not available.',
        'It takes the insert branch, with whatever columns your object happened to carry.',
      ],
    },
    canonicalAnswer: 'It inserts a new row with id 999.',
    solution: md(
      'It inserts. The `SELECT` finds nothing, so `save` takes the insert branch and writes a row with `id = 999` and whatever else your object carried:',
      '',
      code(
        'text',
        'INSERT INTO "articles"("id", "slug", "title", "status", …) VALUES (999, NULL, NULL, ?, …)'
      ),
      '',
      'With nullable columns that succeeds and leaves a half-empty row. With a `NOT NULL` column it fails at the constraint.'
    ),
    explanation:
      '`save` is an upsert keyed on the primary key, and the id in your object is the whole basis for the decision. That makes it the wrong call behind `PUT /articles/:id` on an id from the URL, because a request for a deleted article creates it instead of 404ing, and the row that appears has nulls in every column the request did not mention. `update` reports `{ affected: 0 }` and says nothing, which is the opposite failure: no wrong row, no error either, and a handler that never checks `affected` returns 200 for a write that did not happen. Neither call answers "does this row exist"; that stays yours to ask.',
  },

  {
    slug: 'orm-save-many-not-insert',
    title: 'A thousand statements for five hundred rows',
    category: 'orm',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'A nightly importer writes 500 new rows:',
      '',
      code('ts', 'await articles.save(rows);'),
      '',
      'typeorm 1.1.0 sends `BEGIN`, then one `INSERT` and one `SELECT` per row, then `COMMIT`. That is 1,002 statements, and it takes minutes against a database on another host.',
      '',
      'Name the repository call that sends them as one multi-row `INSERT`.'
    ),
    graderConfig: {
      accept: [
        'insert',
        'insert()',
        'repository.insert',
        'articles.insert',
        '.insert',
        'the insert',
      ],
      acceptPatterns: ['\\binserts?\\b'],
      nearMisses: {
        save: 'That is the call in the prompt. It decides insert or update per row, and the deciding is what the extra statements are.',
        upsert:
          '`upsert` is one statement too, and it is the right call when the rows might already exist. For rows you know are new there is a plainer one.',
        'wrap it in a transaction':
          'It already is: `save` opened one. The statement count is unchanged, and that is what the time is going on.',
        'send them in chunks':
          'Chunking is real and it is the second step, because a statement has a parameter limit. First stop sending one statement per row.',
      },
      hints: [
        'The per-row `SELECT` is `save` reloading each row after writing it, and the per-row `INSERT` is `save` treating each row as its own decision.',
        'You already know these rows are new, so nothing needs deciding per row.',
        'The repository has a call that skips the entity machinery and sends the values.',
      ],
    },
    canonicalAnswer: 'insert',
    solution: md(
      code('ts', 'await articles.insert(rows);'),
      '',
      'One `INSERT … VALUES (…), (…), (…)` plus one `SELECT` to read back the generated ids: two statements instead of 1,002.'
    ),
    explanation:
      '`save` is per-entity by construction: it reads to decide insert or update, writes, then reads back generated columns, and looping it is how a bulk import becomes a round trip per row. `insert` skips all of that and sends the values, which also means it skips cascades, subscribers and the insert-or-update decision, so it is only right when you already know the rows are new. Two things still bound it: databases cap how many bound parameters a statement takes, so a large import is chunked into batches of a few hundred, and `insert` gives you no entity back beyond the identifiers. Where the rows might already exist, `upsert` is the one-statement version with a conflict target.',
  },

  {
    slug: 'orm-eager-ignored-by-query-builder',
    title: 'It loaded the relation until you changed how you asked',
    category: 'orm',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      '`tags` is declared `eager: true` on the entity, and every caller has relied on that for a year:',
      '',
      code('ts', 'const rows = await articles.find();', 'rows[0].tags.map((t) => t.name); // fine'),
      '',
      'Adding a filter meant moving to the query builder, and the same line now throws `TypeError: Cannot read properties of undefined`:',
      '',
      code(
        'ts',
        "const rows = await articles.createQueryBuilder('a').where('a.status = :s', { s: 'published' }).getMany();"
      ),
      '',
      'typeorm 1.1.0. Name what you add to the chain.'
    ),
    graderConfig: {
      accept: [
        'leftjoinandselect',
        "leftjoinandselect('a.tags', 'tag')",
        'left join and select',
        'innerjoinandselect',
        'leftjoinandselect(a.tags, tag)',
      ],
      acceptPatterns: ['(left|inner)\\s*_?join\\s*_?and\\s*_?select'],
      nearMisses: {
        leftjoin:
          '`leftJoin` puts the table in the query without adding its columns to the select list, so `tags` is still undefined. There is a variant that does both.',
        relations:
          'That is the `find` option, and the query builder does not take it. Its equivalent is a join that also selects.',
        'eager: true':
          'It already is. `eager` is honoured by `find` and `findOne` and ignored by the query builder.',
        relationloadstrategy:
          'That picks between one joined statement and a statement per relation, and only `find` takes it. The query builder needs to be told to load the relation at all.',
      },
      hints: [
        'The query builder built exactly the query you described, and you did not mention tags.',
        '`eager` is a `find` feature. The query builder is the layer underneath it and honours nothing you did not ask for.',
        'Join the relation and select its columns in the same call.',
      ],
    },
    canonicalAnswer: "leftJoinAndSelect('a.tags', 'tag')",
    solution: md(
      code(
        'ts',
        'const rows = await articles',
        "  .createQueryBuilder('a')",
        "  .leftJoinAndSelect('a.tags', 'tag')",
        "  .where('a.status = :s', { s: 'published' })",
        '  .getMany();'
      ),
      '',
      '`leftJoin` alone joins the table without selecting it, which changes what the query can filter on and leaves `tags` undefined.'
    ),
    explanation:
      '`eager` is a property of the `find` API, not of the entity as far as the query builder is concerned, so moving one call from `find` to `createQueryBuilder` silently drops every eager relation it was relying on. The failure is a `TypeError` on `undefined` rather than an empty array, which at least fails loudly; the same swap on an optional relation gives you a page that quietly renders nothing. This is the strongest argument against declaring relations eager at all: it makes the loading invisible at the call site, so nobody can see which of their queries depends on it, and the day somebody needs a query builder they have no way of knowing what to add. Load relations where you use them and the coupling is on screen.',
  },

  {
    slug: 'orm-take-not-limit',
    title: 'A page of two that came back as one',
    category: 'orm',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'short-text',
    prompt: md(
      'The list endpoint wants two articles with their tags. The first article carries three.',
      '',
      code(
        'ts',
        'await articles',
        "  .createQueryBuilder('a')",
        "  .leftJoinAndSelect('a.tags', 'tag')",
        "  .orderBy('a.id')",
        '  .limit(2)',
        '  .getMany();'
      ),
      '',
      'typeorm 1.1.0 returns **one** article, carrying two of its three tags.',
      '',
      'Name the method to use instead of `limit`.'
    ),
    graderConfig: {
      accept: ['take', 'take(2)', '.take(2)', 'take()', 'use take'],
      acceptPatterns: ['\\btake\\b'],
      nearMisses: {
        skip: '`skip` is the paging partner of `take` and sets the offset. You want the one that sets the count.',
        offset:
          'That is the partner of `limit`, and it has the same problem: it counts joined rows rather than entities.',
        distinct:
          'The rows are not duplicates to be removed. The `LIMIT` cut the result before TypeORM could group the rows back into entities.',
        getmany: 'It is already `getMany`. The rows were truncated before `getMany` ever saw them.',
      },
      hints: [
        'A joined collection produces one row per pair, so the article with three tags is three rows.',
        '`limit` is `LIMIT` on the joined result, so it counts rows, and two rows here is one article and part of its tag list.',
        'The query builder has a second pair of paging methods that count entities instead.',
      ],
    },
    canonicalAnswer: 'take',
    solution: md(
      code('ts', '.take(2)'),
      '',
      '`take` and `skip` count entities. TypeORM answers them with two statements: a `SELECT DISTINCT` over the joined query to find the first two article ids, then the full query filtered to those ids.',
      '',
      '`limit` and `offset` are `LIMIT` and `OFFSET` on the SQL, which count joined rows.'
    ),
    explanation:
      'A join to a collection fans one entity out into one row per child, so any `LIMIT` on that result is a limit on pairs and cuts an entity in half. `take` exists because the fix is not expressible in one statement: TypeORM runs a `SELECT DISTINCT` to pick the ids for the page, then re-runs the query restricted to them, so the page is right at the cost of a second round trip. The symptom is the giveaway, because a page that returns fewer entities than it asked for and a child list that is short by exactly the overflow is not something a `WHERE` can produce. `limit` is still the right call when nothing collection-shaped is joined, and this is the same trap `getRawMany` shows you directly: six rows for three articles.',
  },

  {
    slug: 'orm-conditional-filters',
    title: 'The search term that vanished from the SQL',
    category: 'orm',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'A search endpoint builds its filters up one at a time:',
      '',
      code(
        'ts',
        'const query = db.select().from(products);',
        'if (term) query.where(ilike(products.name, `%${term}%`));',
        'if (activeOnly) query.where(eq(products.archived, 0));'
      ),
      '',
      'With both set, drizzle-orm 0.45.2 sends:',
      '',
      code('sql', 'select … from "products" where "products"."archived" = ?'),
      '',
      'The search term is gone, and every product comes back. Say why, and what to write instead.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'replaces',
            'replace',
            'overwrites',
            'overwrite',
            'last one wins',
            'the last call',
            'only the last',
            'the second call',
            'second one',
            'discards',
            'throws away',
            'does not combine',
            'is not combined',
            'not additive',
            'sets the clause',
            'sets the where',
            'mutates',
            'same builder',
            'same object',
          ],
          missingFeedback:
            'Two `.where()` calls went out and one condition arrived. Say what the second call did to the first.',
        },
        {
          synonyms: [
            'and(',
            'and()',
            'one where',
            'single where',
            'a single call',
            'one call',
            'combine',
            'combined',
            'collect',
            'array of conditions',
            'list of conditions',
            'build the conditions',
            'push the conditions',
            'one condition',
          ],
          missingFeedback:
            'Say how to get both conditions into the query, given that only one `.where()` survives.',
        },
      ],
      hints: [
        'Only one of the two conditions is in the SQL, and it is not the first one.',
        "Drizzle's `.where()` sets the clause rather than adding to it, and it mutates the builder in place: the same object comes back, with its condition replaced.",
        'Collect the conditions into an array and pass one `and(...)` to a single `.where()`.',
      ],
    },
    canonicalAnswer:
      'In drizzle, `.where()` sets the clause rather than adding to it, and it mutates the builder in place, so the second call replaces the first and only the last condition survives. Collect the conditions into an array and pass one `and(...)` to a single `.where()`. `and` drops undefined entries, so a filter that is not set costs nothing.',
    solution: md(
      code(
        'ts',
        'const filters = [',
        '  term ? ilike(products.name, `%${term}%`) : undefined,',
        '  activeOnly ? eq(products.archived, 0) : undefined,',
        '];',
        '',
        'const rows = await db.select().from(products).where(and(...filters));'
      ),
      '',
      '`and(...)` ignores undefined entries. All of them undefined gives no `WHERE` clause at all, rather than one that matches everything.'
    ),
    explanation:
      'This is the shape of the bug rather than a quirk of one method name, and it is worth checking the first time you use any builder: does a second call to a clause method add to it or replace it, and does it return a new object or the one you had? drizzle-orm 0.45.2 replaces and mutates, so `const base = db.select().from(t)` cannot be reused for a page query and a count query; kysely 0.29.4 does the opposite on both counts, returning a fresh builder and combining repeated `.where()` calls with `AND`, which is what makes a shared base safe there. Nothing about the code tells you which you have, and the failure is silent in the direction that matters: too many rows, not too few.',
  },

  {
    slug: 'orm-join-or-second-query',
    title: 'One statement or three',
    category: 'orm',
    difficulty: 'medium',
    relevance: 'foundational',
    type: 'explain',
    prompt: md(
      'The same call over 40 articles, each carrying a few tags, under the two loading strategies typeorm 1.1.0 offers.',
      '',
      'Default (`join`), one statement:',
      '',
      code(
        'sql',
        'SELECT "Article"."id", "Article"."slug", "Article"."title", …, "tags"."id", "tags"."name"',
        'FROM "articles" "Article"',
        'LEFT JOIN "article_tags" … LEFT JOIN "tags" …'
      ),
      '',
      '`relationLoadStrategy: "query"`, three statements: the articles, then the tags, then the join table.',
      '',
      'Say what the join strategy sends over the wire that the query strategy does not, and what the query strategy pays instead.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'duplicat',
            'repeat',
            'again for each',
            'again for every',
            'once per tag',
            'per tag',
            'one row per',
            'row per pair',
            'every column',
            'the article columns',
            'the parent columns',
            'fan out',
            'fans out',
            'multiplied',
            'multiplies',
            'cartesian',
            'product of',
            'same article',
          ],
          missingFeedback:
            'One statement, and one row per article-tag pair. Say what is in each of those rows that did not need sending twice.',
        },
        {
          synonyms: [
            'round trip',
            'round-trip',
            'roundtrip',
            'more statements',
            'three statements',
            'two statements',
            'extra quer',
            'another quer',
            'more quer',
            'a statement per relation',
            'latency',
            'per relation',
          ],
          missingFeedback: 'The query strategy sends each row once. Say what it spends to do that.',
        },
      ],
      hints: [
        'Count the rows the joined statement returns for one article with three tags.',
        'Every column of the article comes back once per tag it carries, and a second collection joined alongside multiplies rather than adds.',
        'The query strategy sends each row once and pays a round trip per relation to do it.',
      ],
    },
    canonicalAnswer:
      'The join strategy sends one row per article-tag pair, so every column of an article comes back again for each tag it carries, and joining a second collection alongside multiplies the rows rather than adding them. The query strategy sends each row exactly once and pays for it in round trips: a statement per relation instead of one statement for everything.',
    solution: md(
      '- **Join**: one round trip, and the parent row repeated once per child. Wide parents or two collections make the duplication the dominant cost.',
      '- **Query**: each row sent once, and a statement per relation. More round trips, and every one of them is a latency you cannot amortise.',
      '',
      'Neither is a default worth applying everywhere. One wide parent with many children argues for `query`; a narrow parent with a to-one relation argues for the join.'
    ),
    explanation:
      'Both strategies are one query per relation rather than one per row, so neither of them is an N+1 and choosing between them is a different question from fixing one. What decides it is the shape of the data: joining a 40-column parent to a collection of 20 sends those 40 columns 20 times, and joining two collections at once sends the product of the two, which is how a page that returns 400 entities transfers a hundred megabytes. The separate-query strategy trades that for latency, and it is the one that keeps working when the child collection needs its own `LIMIT`, since a `LIMIT` inside a join cannot be applied per parent. Every mature ORM ends up offering both, which is worth knowing when a library appears to have only one: the choice exists, and the default was made for you.',
  },

  {
    slug: 'orm-wrong-column-typo',
    title: 'Two typos, one compile error',
    category: 'orm',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'The same typo, `custmerId` for `customerId`, in two places in one typeorm 1.1.0 codebase:',
      '',
      code(
        'ts',
        'await orders.find({ where: { custmerId: 7 } });',
        '',
        "await orders.createQueryBuilder('o').where('o.custmerId = :id', { id: 7 }).getMany();"
      ),
      '',
      '`tsc` refuses one of them with TS2353, "Object literal may only specify known properties". The other compiles, ships, and throws `SqliteError: no such column: o.custmerId` the first time that endpoint is hit.',
      '',
      'Say which one compiles, and what about it puts it beyond the reach of the checker.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'query builder',
            'querybuilder',
            'createquerybuilder',
            'the second',
            'second one',
            'the builder',
            'the qb',
          ],
          missingFeedback: 'Name which of the two lines the compiler let through.',
        },
        {
          synonyms: [
            'string',
            'a text',
            'text',
            'not an object',
            'no type',
            'untyped',
            'opaque',
            'never parsed',
            'not parsed',
            'cannot look inside',
            "can't look inside",
            'sql fragment',
            'a fragment',
            'just characters',
          ],
          missingFeedback:
            'One condition is an object literal and one is something the compiler has no way to inspect. Say what the second one is.',
        },
      ],
      hints: [
        'One condition is an object and one is a piece of SQL you wrote by hand.',
        'TypeScript checks an object literal against `FindOptionsWhere<Order>`, which is built from the entity.',
        'It cannot look inside a string, so the alias and the column in it are unchecked until the database refuses them.',
      ],
    },
    canonicalAnswer:
      'The query builder one compiles. Its condition is a string of SQL, and TypeScript cannot look inside a string, so the alias and the column names in it are unchecked all the way to the database. The `find` version is an object literal measured against `FindOptionsWhere<Order>`, which is built from the entity, so a key the entity does not have is a compile error.',
    solution: md(
      '- **`find({ where: { … } })`** is an object literal checked against `FindOptionsWhere<Order>`. TS2353 at build time.',
      '- **`.where("o.custmerId = :id")`** is a string. Nothing checks it until the database parses it, which is the first request in production.',
      '',
      'The typed alternative is `.where({ custmerId: 7 })` on the builder, or `eq(orders.custmerId, 7)` in drizzle-orm 0.45.2, where the column is a property and the typo is TS2551 with a "did you mean" attached.'
    ),
    explanation:
      'Where an ORM knows the columns decides when a wrong one costs you something, and the answer is not one per library: it is one per API within a library. The TypeORM find options are typed from the entity and its query-builder string conditions are not, so the same codebase catches the typo in one file and ships it in the next. Drizzle and Kysely have less of that surface because the schema is TypeScript values rather than decorators: `orders.custmerId` is a property that does not exist, and kysely 0.29.4 goes further and refuses to read a column you did not select, with TS2339 against `{ id: number }`. None of that is safety on its own. It moves the moment you find out from a request in production to a red line in the editor, and that move is most of what a typed query builder is for.',
  },

  {
    slug: 'orm-rename-is-a-drop-and-an-add',
    title: 'The migration generator that stops and asks',
    category: 'orm',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'One column is renamed in the schema file and nothing else changes:',
      '',
      code(
        'diff',
        "  export const users = sqliteTable('users', {",
        "    id: integer('id').primaryKey(),",
        "-   emailAddress: text('email_address').notNull(),",
        "+   email: text('email').notNull(),",
        '  });'
      ),
      '',
      'drizzle-kit 0.31.10 will not generate this on its own. It stops and asks a question about the `users` table, and on CI, with no TTY to ask into, it exits with an error instead.',
      '',
      'Say what it sees between the two snapshots, and the reason it has to ask follows.'
    ),
    graderConfig: {
      accept: [
        'a drop and an add',
        'a column dropped and a column added',
        'a deleted column and a new column',
        'one column gone and one column new',
        'a delete and a create',
        'a removed column and an added column',
        'a missing column and a new one',
      ],
      acceptPatterns: [
        '(drop|delet|remov|gone|miss|disappear)\\w*[\\s\\S]{0,60}?(add|creat|new|appear)',
        '(add|creat|new|appear)\\w*[\\s\\S]{0,60}?(drop|delet|remov|gone|miss|disappear)',
      ],
      nearMisses: {
        'a rename':
          'That is what you know and the snapshot diff does not. It has two pictures of the schema and no history between them.',
        'a type change':
          'The type is identical. The name is what moved, and a name is the only thing identifying a column across two snapshots.',
        'a conflict':
          'True, and it is worth naming the two halves of it. What does the diff have on each side?',
      },
      hints: [
        'The generator compares two snapshots of the schema. It was never shown the edit.',
        'One name is in the old snapshot and not the new one. Another is in the new one and not the old.',
        'Nothing in either snapshot says the two are the same column.',
      ],
    },
    canonicalAnswer: 'A column dropped and a column added.',
    solution: md(
      'A column that is gone and a column that is new. Nothing in either snapshot connects them, so drizzle-kit offers you the two readings and makes you pick:',
      '',
      code(
        'text',
        '+ email                    column will be created',
        '~ email_address › email    column will be renamed'
      ),
      '',
      'Pick "created" and the generated migration adds `email` empty and drops `email_address` with everything in it.'
    ),
    explanation:
      'A generated migration is a diff between two snapshots, and a diff has no history in it: identity comes from the name, so changing the name makes it a different column. Only you know it is the same one, which is why the good generators ask instead of guessing, and why a generator that never asks is quietly picking drop-and-add for you. Two things follow. Read every generated migration before committing it, because the destructive version of this is a `DROP COLUMN` that passes review as noise in a file nobody opens. And on CI the prompt is not available at all, so a rename generated by hand on a laptop is the only version that ever exists: generate locally, commit the SQL, and let the deploy apply it rather than regenerate it.',
  },

  {
    slug: 'orm-sqlite-transaction-is-sync',
    title: 'The transaction that refused the callback',
    category: 'orm',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'A transfer that works against Postgres, moved to the SQLite build of the same service:',
      '',
      code(
        'ts',
        'await db.transaction(async (tx) => {',
        '  await tx.update(accounts).set({ balance: 90 }).where(eq(accounts.id, 1));',
        '  await tx.update(accounts).set({ balance: 110 }).where(eq(accounts.id, 2));',
        '});'
      ),
      '',
      'drizzle-orm 0.45.2 on better-sqlite3 12.11.1 throws `TypeError: Transaction function cannot return a promise`, and nothing is written.',
      '',
      'Say what has to change about the callback.'
    ),
    graderConfig: {
      accept: [
        'make it synchronous',
        'make the callback synchronous',
        'drop the async',
        'remove async and await',
        'it has to be synchronous',
        'no async',
        'not async',
        'drop async and await and call run()',
      ],
      acceptPatterns: [
        '\\bsync(hronous(ly)?)?\\b',
        '(drop|remove|delete|lose|no|without)\\w*\\s+(the\\s+)?async',
        "(not|n't) (be )?async",
      ],
      nearMisses: {
        'await the transaction':
          'The outer `await` is fine. better-sqlite3 runs a transaction on the thread, so it is what the callback hands back that it refuses.',
        'use tx instead of db':
          'It already does. Look at what the callback returns rather than at what it calls.',
        'catch the error':
          'The transaction never starts, so there is nothing to recover. The callback has to be a shape the driver can run.',
      },
      hints: [
        'The error is about what the callback returns, not about what is in it.',
        'An `async` function returns a promise however little it does, and better-sqlite3 runs a transaction on the thread with nothing to await.',
        'Drop `async` and the `await`s, and end each statement with `.run()`.',
      ],
    },
    canonicalAnswer: 'Make it synchronous: drop the async and the awaits.',
    solution: md(
      code(
        'ts',
        'db.transaction((tx) => {',
        '  tx.update(accounts).set({ balance: 90 }).where(eq(accounts.id, 1)).run();',
        '  tx.update(accounts).set({ balance: 110 }).where(eq(accounts.id, 2)).run();',
        '});'
      ),
      '',
      'The same code on the Postgres and MySQL drivers takes an async callback, because those drivers are async all the way down.'
    ),
    explanation:
      'better-sqlite3 is synchronous by design: the database is a file this process reads, so there is no socket to wait on and no reason to yield the thread. Its transaction wrapper enforces that, because a callback that returns a promise would let the transaction stay open across turns of the event loop while other code runs statements on the same connection. Drizzle exposes what the driver is rather than hiding it, which is why the callback signature differs between its SQLite and Postgres drivers and why porting a service between them is more than a connection string. The failure is at least loud. The version that is not is the same code under a driver that accepts the promise and commits before the awaited work inside it has finished.',
  },

  codeProblem({
    slug: 'orm-group-joined-rows',
    title: 'Six rows, three orders',
    category: 'orm',
    difficulty: 'medium',
    relevance: 'daily',
    prompt: md(
      'A `LEFT JOIN` to a child table returns one row per pair, so the flat result has to be folded back into one object per parent. That fold is what `getMany` and `$inferSelect` do for you, and what a raw result leaves you to write.',
      '',
      'Write `groupRows(rows)`. Each row is `{ orderId, reference, itemId, itemName }`, and an order with no items arrives once with `itemId` and `itemName` null.',
      '',
      code(
        'js',
        'groupRows([',
        "  { orderId: 1, reference: 'A-1', itemId: 10, itemName: 'bolt' },",
        "  { orderId: 1, reference: 'A-1', itemId: 11, itemName: 'nut' },",
        "  { orderId: 2, reference: 'A-2', itemId: null, itemName: null },",
        ']);',
        '',
        '// [',
        "//   { id: 1, reference: 'A-1', items: [{ id: 10, name: 'bolt' }, { id: 11, name: 'nut' }] },",
        "//   { id: 2, reference: 'A-2', items: [] },",
        '// ]'
      ),
      '',
      'Orders come back in the order they first appear.'
    ),
    starter: 'function groupRows(rows) {\n  \n}',
    tests: [
      {
        name: 'folds the rows of one order into one object',
        expression:
          "groupRows([{ orderId: 1, reference: 'A-1', itemId: 10, itemName: 'bolt' }, { orderId: 1, reference: 'A-1', itemId: 11, itemName: 'nut' }])",
        expected: [
          {
            id: 1,
            reference: 'A-1',
            items: [
              { id: 10, name: 'bolt' },
              { id: 11, name: 'nut' },
            ],
          },
        ],
      },
      {
        name: 'an order with no items keeps an empty list',
        expression: "groupRows([{ orderId: 2, reference: 'A-2', itemId: null, itemName: null }])",
        expected: [{ id: 2, reference: 'A-2', items: [] }],
      },
      {
        name: 'keeps orders in the order they first appear, however the rows interleave',
        expression:
          "groupRows([{ orderId: 2, reference: 'A-2', itemId: 20, itemName: 'washer' }, { orderId: 1, reference: 'A-1', itemId: 10, itemName: 'bolt' }, { orderId: 2, reference: 'A-2', itemId: 21, itemName: 'screw' }]).map((order) => [order.id, order.items.length])",
        expected: [
          [2, 2],
          [1, 1],
        ],
      },
      {
        name: 'an empty result is an empty list',
        expression: 'groupRows([])',
        expected: [],
      },
    ],
    reference: md(
      'function groupRows(rows) {',
      '  const byId = new Map();',
      '  for (const row of rows) {',
      '    let order = byId.get(row.orderId);',
      '    if (!order) {',
      '      order = { id: row.orderId, reference: row.reference, items: [] };',
      '      byId.set(row.orderId, order);',
      '    }',
      '    if (row.itemId !== null) order.items.push({ id: row.itemId, name: row.itemName });',
      '  }',
      '  return [...byId.values()];',
      '}'
    ),
    hints: [
      'You need one object per distinct `orderId`, and you meet each id more than once.',
      'Keep the orders in a `Map` keyed by id so the second row for an order finds the object the first row made. A `Map` also preserves insertion order.',
      'The null `itemId` is a padded row from the `LEFT JOIN`, not an item. Skip it and leave the array empty.',
    ],
    explanation:
      'This is what an ORM does between the driver and your objects, and writing it once is how the row counts stop being surprising: three orders can be six rows, and a second collection joined alongside makes it the product of the two. The null child is the part hand-written versions get wrong, because a `LEFT JOIN` pads the unmatched parent rather than dropping it, and pushing that padding produces an order with one item made entirely of nulls. Keying on the parent id rather than on the array position is the other half: rows are not guaranteed to arrive grouped unless you sorted by the parent, and the `Map` costs nothing and does not care. Reach for this when a query is already raw, which is usually because it carries an aggregate the entity cannot hold.',
  }),

  {
    slug: 'orm-nested-where-truncates-relation',
    title: 'The relation that came back short',
    category: 'orm',
    difficulty: 'hard',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'Retiring a tag starts by finding every article that carries it, with its tags loaded:',
      '',
      code(
        'ts',
        'const carrying = await articles.find({',
        "  where: { tags: { name: 'beta' } },",
        '  relations: { tags: true },',
        '});'
      ),
      '',
      'The first article really carries `beta`, `api` and `billing`. It comes back with `tags` holding one entry. typeorm 1.1.0 sends one statement:',
      '',
      code(
        'sql',
        'SELECT "Article".…, "tags"."id", "tags"."name" FROM "articles" "Article"',
        'LEFT JOIN "article_tags" … LEFT JOIN "tags" …',
        'WHERE "tags"."name" = ?'
      ),
      '',
      'Say why the loaded array is short, and what saving that article back would do.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'same join',
            'one join',
            'the same query',
            'one query',
            'one statement',
            'same statement',
            'filters the join',
            'filters the joined',
            'filters the relation',
            'applies to the relation',
            'applies to the join',
            'only the matching rows',
            'only matching rows',
            'only the beta row',
            'only rows that matched',
            'the rows that matched',
            'built from the same rows',
          ],
          missingFeedback:
            'One statement selected the articles and loaded the tags. Say what the `WHERE` applies to.',
        },
        {
          synonyms: [
            'delete',
            'deletes',
            'deleted',
            'remove',
            'removes',
            'removed',
            'wipe',
            'wipes',
            'lose',
            'loses',
            'lost',
            'strip',
            'strips',
            'drop the rest',
            'drops the others',
            'the whole set',
            'entire set',
            'replace the set',
            'replaces the set',
          ],
          missingFeedback:
            'The array you were handed is short, and `save` treats an array as the whole set. Say what that costs.',
        },
      ],
      hints: [
        'The `where` and the relation are not two separate pieces of work.',
        'One `LEFT JOIN` both matches the articles and supplies the rows the `tags` array is built from, and the `WHERE` narrows it once for both.',
        'So `tags` holds only what matched, and `save` writes an array as the whole tag set for that article.',
      ],
    },
    canonicalAnswer:
      'The `where` and the relation are the same join, so the condition filters the rows the relation is built from as well as the articles it selects: only the `beta` row survives, and `tags` is loaded with one entry rather than three. Saving that article back writes that array as its whole tag set, which deletes the join rows for `api` and `billing`.',
    solution: md(
      'One statement does both jobs, so filtering the articles filters the tags they come back with.',
      '',
      'Two reads keep them separate: find the ids with the condition, then load those articles with their relations unfiltered.',
      '',
      code(
        'ts',
        'const carrying = await articles.find({',
        '  select: { id: true },',
        "  where: { tags: { name: 'beta' } },",
        '});',
        '',
        'const full = await articles.find({',
        '  where: { id: In(carrying.map((a) => a.id)) },',
        '  relations: { tags: true },',
        '});'
      )
    ),
    explanation:
      'A nested condition on a relation is a condition on the join, and the join is also where the relation array comes from, so filtering on a child silently filters the children you get back. Nothing about it looks lossy: you asked for articles matching a tag and you got articles matching a tag, each carrying a `tags` array that is populated and wrong. It turns destructive the moment you write, because `save` reads a relation array as the whole set, so a read that quietly dropped two tags and a write that faithfully persists what it was given combine into a bug neither half commits alone. The two-read shape above is the fix, and the general rule behind it is worth carrying: never write back an entity whose relations were loaded under a filter.',
  },

  {
    slug: 'orm-update-skips-the-subscriber',
    title: 'The audit log that stopped gaining rows',
    category: 'orm',
    difficulty: 'hard',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A subscriber writes one row per column that moved, for the compliance export:',
      '',
      code(
        'ts',
        'async afterUpdate(event) {',
        '  const before = event.databaseEntity;',
        '  if (!before) return;',
        '  for (const column of event.updatedColumns) {',
        '    await log.insert({ field: column.propertyName, before: …, after: … });',
        '  }',
        '}'
      ),
      '',
      'Rows appear when a status change goes through `articles.save({ id, status })`. None appear when the same change goes through `articles.update(id, { status })`, and the subscriber does run in both cases. typeorm 1.1.0.',
      '',
      'Say what `event.updatedColumns` and `event.databaseEntity` hold on the `update` path, and why.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'empty',
            'is []',
            'an empty array',
            'no columns',
            'nothing in it',
            'no entries',
            'zero columns',
            'undefined',
            'is missing',
            'not set',
            'no previous',
            'no before',
            'no database entity',
            'nothing to compare',
          ],
          missingFeedback:
            'Say what the two fields actually hold when the write came from `update`.',
        },
        {
          synonyms: [
            'never read',
            'did not read',
            "didn't read",
            'does not read',
            "doesn't read",
            'no select',
            'without reading',
            'without loading',
            'never loaded',
            'did not load',
            'bare update',
            'straight to',
            'sends the statement',
            'nothing was loaded',
            'no round trip first',
          ],
          missingFeedback:
            'Both fields come from somewhere. Say what `update` skipped that `save` does.',
        },
      ],
      hints: [
        'The loop runs zero times and the guard returns early. Both of those are the same cause.',
        'Compare the two query logs: one of them has a `SELECT` in front of the `UPDATE` and one does not.',
        'With nothing loaded there is no previous entity to hand over and no way to know which columns differ.',
      ],
    },
    canonicalAnswer:
      '`updatedColumns` is an empty array and `databaseEntity` is undefined, so the guard returns and the loop would have run zero times anyway. `update` fires a bare `UPDATE` and never reads the row first, so there is no previous entity to pass on and nothing to diff the new values against. `save` selects the row before writing and hands the subscriber both.',
    solution: md(
      '- **`updatedColumns`**: `[]`. Knowing which columns changed needs the old values, and nothing loaded them.',
      '- **`databaseEntity`**: undefined, for the same reason.',
      '',
      'Route writes that anything reacts to through `save`, or accept that `update` is a statement with no story attached and write the log entry yourself.'
    ),
    explanation:
      'Entity subscribers are built on the read that `save` does, so an API that skips the read fires the hook with the fields blank rather than not firing it at all. That is the worst shape a gap can take: the subscriber runs, the code inside it is correct, and the guard against a missing `databaseEntity` is exactly the line a careful author writes. Nothing is logged, nothing errors, and the export is empty for a month. The same hole opens under `delete` against `remove`, under `insert` against `save`, and under anything built with the query builder, which bypasses the entity layer entirely. If a rule has to hold for every write, an application-level hook is the wrong place for it and a database trigger or an explicit call in one service method is the right one.',
  },

  {
    slug: 'orm-savepoint-nested-rollback',
    title: 'Half of it rolled back',
    category: 'orm',
    difficulty: 'hard',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A nested transaction, with the inner failure logged and swallowed:',
      '',
      code(
        'ts',
        'db.transaction((tx) => {',
        '  tx.update(accounts).set({ balance: 70 }).where(eq(accounts.id, 1)).run();',
        '  try {',
        '    tx.transaction((inner) => {',
        '      inner.update(accounts).set({ balance: 5 }).where(eq(accounts.id, 2)).run();',
        "      throw new Error('inner failed');",
        '    });',
        '  } catch {',
        '    // logged and swallowed',
        '  }',
        '});'
      ),
      '',
      'drizzle-orm 0.45.2 on better-sqlite3 12.11.1 logs:',
      '',
      code(
        'text',
        'update "accounts" set "balance" = ? where "accounts"."id" = ?',
        'savepoint sp0',
        'update "accounts" set "balance" = ? where "accounts"."id" = ?',
        'rollback to savepoint sp0'
      ),
      '',
      'Account 1 ends at 70 and account 2 is untouched. Say what the savepoint did, and what the outer transaction committed.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'only the inner',
            'just the inner',
            'the inner update',
            'the inner work',
            'the inner block',
            'the inner statements',
            'the second update',
            'account 2',
            'part of',
            'partial',
            'not the whole',
            'not everything',
            'back to that point',
            'to the marker',
            'what happened after',
          ],
          missingFeedback:
            'A rollback to a savepoint undoes something narrower than the transaction. Say what.',
        },
        {
          synonyms: [
            'still commit',
            'still commits',
            'still committed',
            'outer commit',
            'the outer transaction commits',
            'commits the first',
            'stays open',
            'still open',
            'survives',
            'is kept',
            'account 1',
            'the first update',
            '70',
          ],
          missingFeedback:
            'The outer transaction was never told anything went wrong. Say what it did at the end.',
        },
      ],
      hints: [
        'Only one `BEGIN` was ever sent. There is no second transaction to roll back.',
        'A savepoint is a named point inside the open transaction, and rolling back to it undoes only what happened after it.',
        'The outer transaction is still open and still fine as far as it knows, so it commits.',
      ],
    },
    canonicalAnswer:
      'A savepoint is a marker inside the open transaction, so rolling back to it undid only the inner update and left the transaction itself running. The outer transaction was never told anything failed, so it committed the first update and account 1 ends at 70 while account 2 is unchanged.',
    solution: md(
      '- **The savepoint** marks a point inside the one open transaction. Rolling back to it undoes the statements after it and nothing else.',
      '- **The outer transaction** stays open and commits, so the first update lands.',
      '',
      'That is the right behaviour for a retryable step inside a larger unit of work. It is the wrong behaviour when the two updates were meant to move money together, and swallowing the inner error is what chose it.'
    ),
    explanation:
      'A connection has one transaction, so a nested `transaction` call cannot open a second one: drizzle-orm 0.45.2 issues `savepoint sp0` and typeorm 1.1.0 issues `SAVEPOINT typeorm_1`, and both roll back to it when the inner block throws. That makes the nesting real but partial, and it puts the decision in the `catch`: rethrow and the outer transaction fails with it, swallow and you have committed half of what the code reads as one atomic block. Both are legitimate, which is why this is worth knowing rather than avoiding. The failure mode to watch for is the accidental one, where a helper wraps its own work in a transaction, gets called from inside another, and its error handling was written on the assumption that it was the outermost.',
  },

  {
    slug: 'orm-expand-then-contract',
    title: 'Ninety seconds of 500s during the rename',
    category: 'orm',
    difficulty: 'hard',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A column rename ships as one migration, `email_address` to `email`, and the service deploys as a rolling update: the migration runs first, then new instances start and old ones drain over about 90 seconds.',
      '',
      'For those 90 seconds a share of requests return 500, and the logs are full of `no such column: email_address`. After the last old instance goes, everything is fine.',
      '',
      'Say what the old instances are doing, and how to sequence the same rename so nothing breaks.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'old code',
            'old instance',
            'old version',
            'old pods',
            'still running',
            'still serving',
            'still select',
            'still query',
            'still ask',
            'still write',
            'still using',
            'old name',
            'email_address',
            'the column it knows',
            'a column that no longer exists',
            'no longer exists',
            'been renamed underneath',
          ],
          missingFeedback:
            'Old and new instances serve traffic at the same time. Say what the old ones are asking the database for.',
        },
        {
          synonyms: [
            'two releases',
            'two deploys',
            'more than one deploy',
            'separate release',
            'separate deploy',
            'in stages',
            'in steps',
            'expand',
            'contract',
            'add the new column',
            'add the column first',
            'both columns',
            'write to both',
            'backfill',
            'drop it later',
            'drop the old one later',
            'remove it later',
          ],
          missingFeedback:
            'Say how to sequence it, given that both versions of the code have to work against whatever the schema is at that moment.',
        },
      ],
      hints: [
        'The migration is instant and the deploy is not. Ask what is running against the new schema before the new code is everywhere.',
        'The old instances are still selecting and writing `email_address`, which no longer exists, so every request touching that table fails until they are gone.',
        'Split it: add the new column and write both, backfill, switch reads, and drop the old column in a later release.',
      ],
    },
    canonicalAnswer:
      'The old instances are still selecting and writing `email_address`, and the migration took it away underneath them, so every request that touches that table fails until they finish draining. Sequence it as expand then contract: one release adds `email` and writes both columns while still reading the old one, a backfill copies what is already there, a later release reads and writes only `email`, and a third drops `email_address` once nothing refers to it.',
    solution: md(
      '- **What breaks**: old instances and the new schema overlap. The old code queries a column the migration removed.',
      '- **The sequence**: add `email` (nullable), deploy code that writes both and reads `email_address`. Backfill. Deploy code that reads and writes `email` only. Drop `email_address`.',
      '',
      'Every step leaves both the previous and the next version of the code working against the schema as it is at that moment, which is the property that makes the deploy order stop mattering.'
    ),
    explanation:
      'A migration and a deploy are two events, and for a window in between them the schema and the code disagree; a rolling deploy, a canary and a rollback all widen that window, and a rollback in particular means the *old* code has to work against the *new* schema, which is the case people forget. Expand and contract is the shape that survives all of it: only additive changes ship next to a deploy, and destructive ones ship a release later, when nothing refers to what they destroy. The cost is real and it is the point: a one-line rename becomes three releases and a backfill, and the backfill on a large table needs batching so it does not hold locks. The same reasoning covers adding a `NOT NULL` column, which is add nullable, backfill, then constrain, and never one migration.',
  },

  codeProblem({
    slug: 'orm-batch-one-tick',
    title: 'One query for the whole tick',
    category: 'orm',
    difficulty: 'hard',
    relevance: 'occasional',
    prompt: md(
      'A GraphQL resolver runs per object, so a board of 40 replies asks for an author 40 times and nobody can see the list to join it. The fix is to collect the ids asked for during one tick and answer all of them with one query.',
      '',
      'Write `createLoader(fetchMany)`. It returns a `load(key)` function, and every key asked for before the next microtask checkpoint is passed to `fetchMany` in a single call. `fetchMany(keys)` returns a `Map` from key to row; a key with no row is absent from the map and `load` resolves to `undefined` for it.',
      '',
      code(
        'js',
        'const load = createLoader(source.fetch);',
        'await Promise.all([load(1), load(2), load(3)]);',
        'source.calls; // [[1, 2, 3]]'
      ),
      '',
      '`createSource` is a stand-in written for this exercise, since the grader has no database in it. `queueMicrotask` is available.'
    ),
    setup: md(
      '// A stand-in for one query: it answers a whole list of ids at once and',
      '// records the lists it was given.',
      'function createSource(table) {',
      '  const calls = [];',
      '  return {',
      '    calls,',
      '    fetch(ids) {',
      '      calls.push([...ids]);',
      '      return new Map(',
      '        ids.filter((id) => table[id] !== undefined).map((id) => [id, table[id]])',
      '      );',
      '    },',
      '  };',
      '}',
      '',
      "const people = { 1: 'ana', 2: 'bo', 3: 'cy' };"
    ),
    starter: 'function createLoader(fetchMany) {\n  \n}',
    tests: [
      {
        name: 'resolves each key with its row',
        expression:
          '(async () => { const s = createSource(people); const load = createLoader(s.fetch); return Promise.all([load(1), load(3)]); })()',
        expected: ['ana', 'cy'],
      },
      {
        name: 'asks the source once for a whole tick',
        expression:
          '(async () => { const s = createSource(people); const load = createLoader(s.fetch); await Promise.all([load(1), load(2), load(3)]); return s.calls; })()',
        expected: [[1, 2, 3]],
      },
      {
        name: 'a key with no row resolves to undefined',
        expression:
          '(async () => { const s = createSource(people); const load = createLoader(s.fetch); return load(9); })()',
        expectedCode: 'undefined',
      },
      {
        name: 'a later tick is a second batch',
        expression:
          '(async () => { const s = createSource(people); const load = createLoader(s.fetch); await load(1); await load(2); return s.calls; })()',
        expected: [[1], [2]],
      },
    ],
    reference: md(
      'function createLoader(fetchMany) {',
      '  let pending = [];',
      '',
      '  return (key) =>',
      '    new Promise((resolve) => {',
      '      if (pending.length === 0) {',
      '        queueMicrotask(() => {',
      '          const batch = pending;',
      '          pending = [];',
      '          const found = fetchMany(batch.map((entry) => entry.key));',
      '          for (const entry of batch) entry.resolve(found.get(entry.key));',
      '        });',
      '      }',
      '      pending.push({ key, resolve });',
      '    });',
      '}'
    ),
    hints: [
      '`load` has to return a promise it does not settle yet, so keep the `resolve` alongside the key.',
      'Schedule the flush when the first key of a batch arrives, with `queueMicrotask`, and let every key that arrives before it runs join the same list.',
      'In the flush: take the pending list, reset it to empty **before** calling `fetchMany`, then resolve each entry with `found.get(entry.key)`.',
    ],
    explanation:
      'This is DataLoader in nine lines, and the reason it exists is that a resolver cannot see the list it is part of: the batch is assembled by the keys turning up rather than by anyone planning a join, which is what makes it work for any document shape the client sends. The microtask boundary is the whole design, because promise callbacks are drained before the loop advances, so everything the current resolution round asked for is in the list. Two things are easy to get wrong. Reset `pending` before calling `fetchMany`, or a key requested from inside the flush joins a batch that is already being answered. And build one of these per request rather than per process: a loader remembers what it fetched, so a shared one hands the rows fetched for the first caller to the second, which is a wrong answer rather than a slow one.',
  }),

  typeProblem({
    slug: 'orm-ts-row-from-columns',
    title: 'The row type behind the schema',
    category: 'orm',
    difficulty: 'medium',
    relevance: 'foundational',
    prompt: md(
      'A schema in Drizzle or Kysely is TypeScript values, and the row type is derived from them rather than written twice. This is that derivation, stripped to its bones: a table is an object of `Column<T>`, and a row is the same keys carrying the values.',
      '',
      'Write `Row<T>`, so `Row<UserTable>` is what one selected row looks like.'
    ),
    setup: md(
      'interface Column<T> {',
      '  /** The value this column holds in a row. */',
      '  readonly value: T;',
      '}',
      '',
      'interface UserTable {',
      '  id: Column<number>;',
      '  email: Column<string>;',
      '  nickname: Column<string | null>;',
      '}'
    ),
    starter: 'type Row<T> = T;',
    tests: [
      {
        name: 'unwraps every column to the value it holds',
        type: 'Row<UserTable>',
        equals: '{ id: number; email: string; nickname: string | null }',
      },
      {
        name: 'a nullable column keeps its null',
        compiles: md(
          "const row: Row<UserTable> = { id: 1, email: 'a@example.com', nickname: null };",
          'const name: string | null = row.nickname;'
        ),
      },
      {
        name: 'a nullable column is not narrowed to the value on its own',
        rejects: md(
          "const row: Row<UserTable> = { id: 1, email: 'a@example.com', nickname: null };",
          'const name: string = row.nickname;'
        ),
        errorCode: 2322,
      },
      {
        name: 'a key that is not a column is left as it is',
        type: 'Row<{ id: Column<number>; tableName: string }>',
        equals: '{ id: number; tableName: string }',
      },
    ],
    reference: md(
      'type Row<T> = {',
      '  [K in keyof T]: T[K] extends Column<infer V> ? V : T[K];',
      '};'
    ),
    hints: [
      'The keys are the same and only the values change, which is what a mapped type is for.',
      'Each value is a `Column<something>` and you want the something. `infer` in a conditional type is how you take a type parameter back out.',
      '`{ [K in keyof T]: T[K] extends Column<infer V> ? V : T[K] }`',
    ],
    explanation:
      'This is the single mechanism that makes a typed query builder worth using: the schema is one declaration, and the row type, the insert type and the result of a select are all computed from it, so a column that is renamed or made nullable moves every type that touched it in the same commit. Writing the row type by hand alongside the schema gives you the same editor experience and none of the guarantee, because nothing checks the two against each other and they drift on the first migration nobody mirrored. The `: T[K]` fallback is what lets a table mix wrapped columns with plain properties, and dropping it turns every non-column key into `never`, which is a mapped type quietly deleting fields rather than failing.',
  }),

  typeProblem({
    slug: 'orm-ts-select-narrows-the-row',
    title: 'The column you did not select',
    category: 'orm',
    difficulty: 'medium',
    relevance: 'daily',
    prompt: md(
      'This helper stands in for `.select([...])`. It takes column names and hands back rows, and it says the rows are whole orders however few columns you asked for:',
      '',
      code(
        'ts',
        "const rows = select(['id']);",
        'rows[0]!.reference; // compiles, and the column is not in the result'
      ),
      '',
      'Change the signature so the returned rows carry only the columns that were named. A name that is not a column has to stay a compile error.'
    ),
    setup: md(
      'interface OrderRow {',
      '  id: number;',
      '  reference: string;',
      '  totalCents: number;',
      "  status: 'open' | 'paid';",
      '}'
    ),
    starter: md(
      'function select(columns: (keyof OrderRow)[]): OrderRow[] {',
      '  void columns;',
      '  return [];',
      '}'
    ),
    tests: [
      {
        name: 'the rows carry exactly the columns that were named',
        compiles: md(
          "const rows = select(['id']);",
          'const row: (typeof rows)[number] = { id: 1 };'
        ),
      },
      {
        name: 'a column that was not selected is not on the row',
        rejects: md("const rows = select(['id']);", 'const ref: string = rows[0]!.reference;'),
        errorCode: 2339,
      },
      {
        name: 'a name that is not a column is refused',
        rejects: "select(['id', 'nope']);",
        errorCode: 2322,
      },
    ],
    reference: md(
      'function select<K extends keyof OrderRow>(columns: K[]): Pick<OrderRow, K>[] {',
      '  void columns;',
      '  return [];',
      '}'
    ),
    hints: [
      'The argument and the return type are related, and the signature says nothing about that.',
      'Make the column names a type parameter constrained to `keyof OrderRow`, so the call site pins it to the literal names passed.',
      '`function select<K extends keyof OrderRow>(columns: K[]): Pick<OrderRow, K>[]`',
    ],
    explanation:
      'Constraining the type parameter to `keyof OrderRow` does both jobs at once: it refuses a name that is not a column, and it captures the literal names so `Pick` can narrow the result to them. Widening the parameter to `(keyof OrderRow)[]` without a type parameter, which is the starter, keeps the first guarantee and loses the second, so every result is a whole row and reading a column you did not fetch compiles and is `undefined` at runtime. Kysely 0.29.4 does exactly this, and reading `reference` off a result selected as `["id"]` is TS2339 against `{ id: number }`. Annotating the return as `any[]` removes both errors and is the near miss worth naming: it looks like it works, and the checks that prove the type is load-bearing are the ones it fails.',
  }),

  typeProblem({
    slug: 'orm-ts-insert-column-type',
    title: 'The type a column has when you write it',
    category: 'orm',
    difficulty: 'hard',
    relevance: 'occasional',
    prompt: md(
      'A column does not have one type. Kysely 0.29.4 writes it as `ColumnType<Select, Insert, Update>`: what you read back, what you may supply on insert, and what you may supply on update. A generated id reads as a number and may be left out of an insert; a timestamp reads as a `Date` and is written as a string.',
      '',
      'Write `OnInsert<T>`: the shape you have to hand an insert. Every `ColumnType` becomes its insert type, and a plain column stays as it is.'
    ),
    setup: md(
      'interface ColumnType<S, I, U> {',
      '  readonly select: S;',
      '  readonly insert: I;',
      '  readonly update: U;',
      '}',
      '',
      'interface PostTable {',
      '  id: ColumnType<number, number | undefined, never>;',
      '  title: ColumnType<string, string, string>;',
      '  createdAt: ColumnType<Date, string, never>;',
      '  views: number;',
      '}'
    ),
    starter: 'type OnInsert<T> = T;',
    tests: [
      {
        name: 'takes the insert type from each column and leaves a plain one alone',
        type: 'OnInsert<PostTable>',
        equals: '{ id: number | undefined; title: string; createdAt: string; views: number }',
      },
      {
        name: 'reads the middle position, not the first or the last',
        type: 'OnInsert<{ tag: ColumnType<string, number, boolean> }>',
        equals: '{ tag: number }',
      },
      {
        name: 'an insert built from it type-checks',
        compiles: md(
          'const row: OnInsert<PostTable> = {',
          '  id: undefined,',
          "  title: 'Hello',",
          "  createdAt: '2026-08-04T00:00:00Z',",
          '  views: 0,',
          '};',
          'const when: string = row.createdAt;'
        ),
      },
      {
        name: 'the select type is refused where the insert type differs',
        rejects: md(
          'const row: OnInsert<PostTable> = {',
          '  id: undefined,',
          "  title: 'Hello',",
          '  createdAt: new Date(),',
          '  views: 0,',
          '};'
        ),
        errorCode: 2322,
      },
    ],
    reference: md(
      'type OnInsert<T> = {',
      '  [K in keyof T]: T[K] extends ColumnType<unknown, infer I, unknown> ? I : T[K];',
      '};'
    ),
    hints: [
      'Same keys, different values, and only some of the values change: that is a mapped type with a conditional inside it.',
      'You want the second type argument. `infer` can go in any position of the type you are matching against, and the ones you do not care about can be `unknown`.',
      '`{ [K in keyof T]: T[K] extends ColumnType<unknown, infer I, unknown> ? I : T[K] }`',
    ],
    explanation:
      'One column, three types, is the thing this models and the thing people are surprised by: `Selectable<T>`, `Insertable<T>` and `Updateable<T>` in Kysely are three different shapes over one table declaration, and `$inferSelect` against `$inferInsert` in drizzle-orm is the same idea with two. It has to work that way because a generated id is a number you read and nothing you may write, and a timestamp column often accepts a string it will never hand back. Inferring from the middle position is the whole trick, and putting `unknown` in the two you do not want keeps the match wide enough to hit every `ColumnType`. The `: T[K]` fallback is what lets `views` stay a plain `number`, and answering `any` passes the compile check while failing both identity checks and the refusal, which is exactly the amber verdict it deserves.',
  }),
];
