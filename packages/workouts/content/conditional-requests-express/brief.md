# Stop resending the report

The overview page polls `GET /report` every ten seconds. The report is 2,400 rows and a little over
160 KB of JSON, and it changes when a sale lands: a few times an hour in the day, never overnight.
Every poll comes back with the whole thing.

## The task

`createReportHandler` in `src/server/report.ts` is the endpoint. Make the poll that finds nothing new
stop paying for the whole report.

**Send a validator with the report.** An `ETag` on the 200. An entity tag is a quoted string, so
`"7"` rather than `7`. The same report gets the same tag, and a sale lands it a different one.

**Honour `If-None-Match`.** A caller whose tag still matches gets `304` and no body at all. A caller
with a stale tag, or none, gets the report.

**Compare the way the spec says.** RFC 9110 compares this header with the weak function, so `W/"7"`
and `"7"` are the same tag. The CDN in front of this service marks tags weak on the way back, and a
cache holding more than one copy sends a comma-separated list.

**Keep the 304 cheap.** Answering one has to cost less than answering a 200, not just send less.

## Notes

`src/server/sales.ts` is the data behind the report, and it is read-only:

- `buildReport()` assembles it. Here that is a loop; in production it is an aggregate over the sales
  table that takes most of a second.
- `revision` goes up by one on every write, and reading it costs nothing.
- `builds` counts how many times `buildReport()` has run. No real service has this; a checkpoint
  reads it.

`app.ts` turns Express's built-in ETag off with `app.set('etag', false)`, so the only validator on the
response is the one you set.

`npm`-style commands are not available here. Hit **Run checkpoints** to see where you are.

## If you finish early

- None of this shortens the round trip, only the answer. Work out what `Cache-Control: max-age=10`
  would change for a page polling every ten seconds, and what it would cost you the second a sale
  lands.
- `If-None-Match: *` means "if you hold any version of this at all". Decide what this endpoint should
  answer, and what a `PUT` should answer to the same header.
- Express generates an ETag for you, from a hash of the body it has already built. Work out which
  half of this workout that gives you and which half it leaves exactly where it was.
