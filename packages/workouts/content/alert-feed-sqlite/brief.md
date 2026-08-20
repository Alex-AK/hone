# The alert nobody saw

On-call works the alert feed from the top down, twenty at a time, acknowledging each one they have
dealt with. Tuesday night went badly twice.

Two engineers chased the same checkout-api alert. It was the last thing on one page and the first
thing on the next, so both of them picked it up and both of them paged the same team.

And an alert nobody ever saw ran for forty minutes. It was firing the whole time, it was in the feed,
and it was on nobody's page. It was still there in the morning.

The feed does not hold still while somebody reads it. Alerts fire and get acknowledged the whole time
it is open.

## The task

**`src/server/feed.ts`** is the feed, and the only file you can edit.

What has to be true when you are done:

- The page is the page it has always been: firing alerts, newest first, twenty of them by default and
  as many as `limit` asks for otherwise.
- `listAlerts` keeps its signature, and the cursor stays opaque. The client never reads one. It keeps
  the cursor a page came back with and hands it over to ask for the next.
- `nextCursor` is null once there is nothing after the page just returned.
- `src/server/db.ts` builds the database and is not editable, so the fix lives in the query.
- No new dependency.

## The last checkpoint

The first four walk one feed: the 630 alerts below, twenty to a page. The last one generates the feed
instead, along with the page size and what happens to it mid-walk, and judges the walk by the same
rules. Two things about its feeds are worth knowing. They are paged one, two, three and more at a
time rather than twenty, so a page boundary lands in a different place on every one of them. And an
id there says nothing about when the alert fired: the 630 below were numbered in the order they
arrived, and nothing in the schema says they had to be.

It adds no rules. Everything it checks is on this page already. When it fails it prints the shortest
feed that still breaks one, what was acknowledged or fired while that feed was walked, and which ids
came back on each page, which is a complete reproduction.

## Notes

The database is in-memory SQLite through better-sqlite3, so every call on it is synchronous.
`db.prepare(sql)` hands back a statement: `.all(...)` answers with an array of rows, `.get(...)` with
one row or `undefined`, and `.run(...)` with `{ changes, lastInsertRowid }`.

```sql
CREATE TABLE alerts (
  id INTEGER PRIMARY KEY,
  service TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('firing', 'acknowledged')),
  created_at TEXT NOT NULL
);

CREATE INDEX alerts_feed_idx ON alerts (status, created_at DESC, id DESC);
```

- `created_at` is a UTC ISO-8601 string, so it sorts as text.
- 630 alerts are seeded and 230 of them are still firing. Thirty of those arrived together:
  checkout-api flapped and the notifier wrote them in one statement, so all thirty carry the same
  `created_at` to the millisecond.
- The checkpoints read the feed a page at a time and move it between two reads, the way Tuesday night
  did. They judge the whole walk rather than one page: which ids came back, how many times each, and
  whether anything that was firing never appeared at all.

`npm`-style commands are not available here. Hit **Run checkpoints** to see where you are.

## If you finish early

- A cursor saved yesterday points at an alert somebody has acknowledged since. Work out what the next
  page does with it, and whether that is the behaviour you want.
- Previous-page is the same idea backwards and it is not free. Work out what changes in the query,
  and what the client has to keep for it.
- The UI asks for a total and a jump to page 47. Decide what you can honestly offer instead of each.
