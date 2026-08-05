# Live dashboard over SSE

The fleet page asks `/metrics` for the numbers every ten seconds, and everyone who watches it wants
it faster. It does not need a WebSocket. The browser sends nothing back, so one HTTP response that
never finishes will do, and the browser already knows how to reconnect to one.

## The task

Two files: `src/server/stream.ts` and `src/client/Dashboard.tsx`.

### The endpoint

`createStream(feed, { keepAliveMs })` returns the handler behind `GET /events`.

**Open the stream and say what it is.** `Content-Type: text/event-stream` and `Cache-Control:
no-store`, on the wire when the request arrives rather than when the first reading does. The first
reading might be a minute away.

**Frame each reading as an event.** A `data:` line carrying the JSON, and an `id:` on every event.

**Give a returning client what it missed.** A browser that has seen an id sends it back in a
`Last-Event-ID` header when it reconnects. Read that header and replay from it before you send
anything new. A request without the header is a first connection: it gets the stream from now on,
not the whole buffer.

**Keep it alive, and let it go.** Send something every `keepAliveMs` that keeps a proxy in the middle
from mistaking an idle connection for a dead one, without it arriving as an event. When the request
closes, clear the timers and unsubscribe.

### The dashboard

`Dashboard.tsx` opens the stream and paints what arrives. Two things are missing.

**Close the stream when the component goes.** Nothing else is going to.

**Say when the connection has dropped.** Put the connection state in an element with `role="status"`
so it is announced rather than only drawn. `EventSource` reconnects on its own, so this is a label
rather than a retry loop, and it must leave the readings alone: numbers with a warning on them beat
an empty page.

## Notes

`ReadingFeed` is the meter. `subscribe` hands back the function that undoes it, and `since(id)`
returns everything published after that id. It keeps the last 50 readings, so replay has a limit,
the way every buffer does.

`app.ts` is wiring, and it counts two things the checkpoints read: how many clients have gone, and
how many writes went to a response whose client had already gone. The second has no equivalent in a
real service, because node discards those writes without complaint.

jsdom has no `EventSource`, so `src/client/event-source.ts` is one: the browser's API with a scripted
connection behind it instead of a socket. The checkpoints send events and kill the connection by
calling functions, which is why none of this waits on a clock.

`npm`-style commands are not available here. Hit **Run checkpoints** to see where you are.

## If you finish early

- The buffer holds fifty readings and a client can be away for longer than that. Work out what the
  endpoint should send when the gap is bigger than the buffer, because replaying what you happen to
  have left is a wrong answer nobody notices.
- `EventSource` cannot set request headers, so there is nowhere to put `Authorization`. Decide
  between a cookie and a token in the query string, and work out which one you can live with.
- One held-open connection lives on exactly one server instance. Sketch what has to change the day
  there are two of them and the reading is published on the other one.
