# Stream the export

Finance downloads their orders as CSV from `GET /exports/orders.csv`, and it has worked for two
years. The account that onboarded last week has 400,000 orders. Every attempt to export that one
walks the container up to its memory limit, the process restarts, and the browser shows a failed
download. The next account down, at 9,000 orders, exports fine and the file it gets is correct.

## The task

One file: **`src/server/export.ts`**. Send the same export to a client that reads slowly, and keep
the response flat while you do.

**The file does not change.** The header row `id,placed_at,customer,region,units,total_pence`, then
one line per order in cursor order, LF endings, and a newline after the last row. A field holding a
comma or a double quote is wrapped in double quotes with its own quotes doubled, which is RFC 4180
and what a spreadsheet expects. Three of the seven customer names need it.

**It arrives as a download.** `Content-Type: text/csv; charset=utf-8` and
`Content-Disposition: attachment; filename="orders.csv"`.

**The response never holds more than 256 KiB at once.** That is what a checkpoint measures: the most
bytes queued inside the response at any point while it was being produced, against a client reading
at a fixed rate. The export is around 1.2 MB, so sending less is not a way past it.

**Same route, and nothing new installed.** Everything this needs is in Node.

## What you are given

**`src/server/orders.ts`** is the table. `rows()` is a cursor: it yields one order at a time and
holds none of them, the same as a database cursor does. It is read-only and it is not the problem.

**`src/server/meter.ts`** is the byte counter. It wraps `write` and `end` and reads
`res.writableLength` straight after each call, which is the only moment the number can grow.
`peakBufferedBytes` is the worst that number ever got, and `bytesWritten` is what the handler handed
over. No real service has this; a checkpoint reads it, and in production the same number is a
memory graph.

**`src/server/app.ts`** installs the meter and turns Express's ETag off, because Express makes a tag
by hashing the finished body and this response is never finished in one place.

**The checkpoints' client takes 32 KiB every 4 milliseconds and not a byte more.** It reads over an
in-memory socket rather than a real one, so nothing is absorbed by a kernel on the way past and the
bytes queued in the response are exactly the bytes your handler queued. Two of the three checkpoints
run 20,000 orders through it. If nothing new arrives for two seconds the client gives up, and the
checkpoint reports how far it got.

## Notes

The handler can be `async`: Express 5 takes the promise you return, and turns a rejected one into a
500 rather than a request that hangs.

`npm`-style commands are not available here. Hit **Run checkpoints** to see where you are.

## If you finish early

- Somebody closes the tab four seconds into a nine-second export. Nothing about your loop knows
  that yet. Find out what `res` emits when it happens, and what it costs to keep producing rows for
  a socket nobody is on the other end of.
- Write it a second time with `pipeline` over a generator, and decide which of the two you would
  rather be reading at 3am with the export broken.
- This export gzips to a sixth of its size. Work out where `zlib.createGzip()` goes, and what the
  number this workout measures does once a second stream is in the chain.
