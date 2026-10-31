---
title: Backpressure
question: The export streams fine on my machine and eats the heap in production. Where did the rows go?
order: 3
practise:
  - node-flowing-mode-ignores-async
  - node-write-returned-false
  - node-backpressure-drain-loop
  - node-pipeline-over-pipe
  - streaming-export-express
sources:
  - author: Node.js
    title: 'Stream: Buffering'
    url: https://nodejs.org/api/stream.html#buffering
  - author: Node.js
    title: 'Stream: writable.write(chunk[, encoding][, callback])'
    url: https://nodejs.org/api/stream.html#writablewritechunk-encoding-callback
  - author: Node.js
    title: "Stream: Event: 'drain'"
    url: https://nodejs.org/api/stream.html#event-drain
  - author: Node.js
    title: 'Stream: readable.pipe(destination[, options])'
    url: https://nodejs.org/api/stream.html#readablepipedestination-options
  - author: Node.js
    title: 'Stream: stream.pipeline(streams, callback)'
    url: https://nodejs.org/api/stream.html#streampipelinestreams-callback
  - author: Node.js
    title: 'Stream: stream.getDefaultHighWaterMark(objectMode)'
    url: https://nodejs.org/api/stream.html#streamgetdefaulthighwatermarkobjectmode
  - author: Node.js
    title: Backpressuring in Streams
    url: https://nodejs.org/learn/modules/backpressuring-in-streams
verified: 2026-08-03
---

A stream lets a server send a large response a piece at a time instead of building it all in memory
first. That only works if the code producing the pieces slows down when the receiver is slower than
it. Node tells you when to slow down, but quietly: ignore the signal and nothing fails, and the
pieces pile up in memory until the process runs out.

## The model

**Every stream has a buffer in the middle of it, and the one thing tying the speed of the producer
to the speed of the consumer is the value `write()` hands back.**

Node states the rule directly: "While the total size of the internal write buffer is below the
threshold set by `highWaterMark`, calls to `writable.write()` will return `true`. Once the size of
the internal buffer reaches or exceeds the `highWaterMark`, `false` will be returned." The default
mark is 65536 bytes, or 16 objects in object mode, and it is what an HTTP response, a file and a
socket all start with.

Two properties of that `false` decide how the code around it has to be written.

**It does not mean the write failed.** The chunk was accepted and queued. Nothing is dropped, no
error is raised, and the data will go out eventually.

**It is advice, not a wall.** The same docs: "the `highWaterMark` option is a threshold, not a
limit: it dictates the amount of data that a stream buffers before it stops asking for more data. It
does not enforce a strict memory limitation in general." Keep writing and the stream keeps
accepting, which is why ignoring backpressure costs memory rather than raising anything you could
catch.

So the cycle a writer is meant to run is this one:

```
producer                stream buffer (highWaterMark 64 KiB)         consumer

write() -> true         [########........................]  16 KiB   reading
write() -> true         [########################........]  48 KiB   reading slowly
write() -> false        [################################]  64 KiB   <-- stop here
   (no writes)          [################................]  32 KiB   catching up
   (no writes)          [................................]   0 KiB
'drain'  <-------------------------------------------------------------- empty
write() -> true         [########........................]  16 KiB   reading
```

Two details of that picture are where fixes go wrong. `drain` fires when the buffer has emptied
rather than when it drops back under the mark: sampled at the event, `writableLength` is 0. And it
is emitted **only** after a write that returned `false`, so a loop that waits for `drain` after
every chunk stops on the first chunk that had room and never resumes.

The reading side is the same idea pointed the other way, and it is easier to get wrong because
nothing returns `false`. Attaching a `data` handler switches a readable into flowing mode and pushes
chunks at you regardless of what the handler is doing, so making that handler `async` buys nothing:
over a 50-chunk source with a 1ms handler, all 50 were in flight at once. The same loop written as
`for await (const chunk of readable)` waits for its own body, and the peak was 1.

`pipe` runs the write cycle for you: the docs say it manages the flow so a faster readable does not
overwhelm the destination. What `pipe` does not do is errors. The same docs say that when the
readable errors, the destination is not closed for you, and you have to close each stream yourself
to avoid leaking memory. Fail the destination mid-chain and the source stays open:
`source.destroyed` reads `false`, and with nothing listening for `error` the process exits 1.
`pipeline` is the version that forwards the failure to one callback and destroys every stream in the
chain.

## Worked example

An export endpoint, written the way it usually is first:

```js
for (const row of rows) res.write(toCsvLine(row));
res.end();
```

Against 400,000 rows of about 200 bytes, sent to a client reading 64 KiB every 10ms, that queues the
entire export inside the response object (peak `res.writableLength` 82.8 MB), and resident size
climbs to 421 MB. The loop retains nothing, which is what makes it confusing to look at. The stream
is holding all of it.

The fix is to read the return value:

```js
for (const row of rows) {
  if (!res.write(toCsvLine(row))) {
    await new Promise((resolve) => res.once('drain', resolve));
  }
}
res.end();
```

Same rows, same slow client: peak buffered 0.1 MB. What bounds the amount in flight is now the
socket rather than the heap.

Yielding looks like it should help and does not. The same loop with a `setImmediate` every thousand
rows and no check on `write()` peaked at 74.9 MB queued, because giving the loop a turn does not
make the client read any faster.

Hand-writing the loop at all is for a source that is not already a stream. When both ends are,
`pipeline` is shorter and closes things on the way out:

```js
import { pipeline } from 'node:stream/promises';

await pipeline(req, zlib.createGzip(), fs.createWriteStream(path));
```

A generator covers the export above, at 0.1 MB peak, because `Readable.from` pulls from it one value
at a time:

```js
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

function* lines() {
  for (const row of rows) yield toCsvLine(row);
}

await pipeline(Readable.from(lines()), res);
```

## Traps

**Resident memory climbs through an export until the process is OOM-killed.** A `write()` returned
`false` and the loop kept going, so the rows queued in the stream instead of going out on the
socket. Nothing errors and the response is correct, so every test that checks the body passes. Note
what is not the reason: a fast consumer does not save you. Against a client on loopback reading as
quickly as it could, the same loop got `false` back on nearly every write and still peaked at 82.8
MB queued, because a synchronous loop never gives the stream a turn to flush. Reproduce against a
deliberately slow consumer, where the same bug ends the process.

**The handler wrote one chunk and hung forever.** It awaits `drain` after every write rather than
only after a `false` one. Nothing emits `drain` unless a write returned `false`, so the first chunk
with room in the buffer parks the request permanently: measured, stuck after one chunk.

**A failed upload leaves a file descriptor behind, or takes the process down.** `pipe` connects data
and end-of-stream and nothing else, so an error reaches only the stream that raised it. Every stream
in a three-`pipe` chain needs its own `error` listener, the source is left open when the destination
fails, and the listener you forget is an unhandled `error` event rather than a caught failure. Use
`pipeline`, which handles the case that actually happens most: a client hanging up mid-upload.

**Making the `data` handler `async` did not slow the source down.** Flowing mode does not wait for a
handler, so an `async` one starts every chunk at once and the size of the source sets the
concurrency. Consume with `for await`, or `pipeline` into a `Writable` whose callback you control.
