---
title: Streaming a model response
question: The tokens arrive one at a time. What has to happen between the model and the browser?
order: 2
practise:
  - ai-stream-partial-chunk
  - ai-stream-error-after-200
  - node-chunk-splits-a-character
  - http-sse-content-type
  - http-streaming-response
  - live-dashboard-sse
sources:
  - author: MDN
    title: Using server-sent events
    url: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
  - author: MDN
    title: 'TextDecoder: decode() method'
    url: https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder/decode
verified: 2026-08-02
---

Streaming means showing a model's answer as it is written, a few words at a time, instead of leaving
the user in front of a blank screen until the whole thing is done. The catch is at both ends. The
browser receives raw pieces that do not line up with words or messages, and the server has already
said everything went fine before it knows whether it will.

## The model

**A stream is bytes, and you have to put the message boundaries back.** The provider sends events;
the network sends whatever fits. A chunk can end halfway through a line, and it regularly does.

The wire format for SSE is text encoded as UTF-8, served as `text/event-stream`, with messages
separated by a pair of newlines. Each message is lines of `field: value`, and four field names mean
anything: `data`, `event`, `id` and `retry`. Everything else is ignored, and a line starting with a
colon is a comment, which is what a keep-alive is. Consecutive `data:` lines in one message are
concatenated with a newline between them.

Two consequences fall out of that shape, and both of them decide how your code is written.

**The status code is spent before you know how it went.** Headers go out with the first chunk, so by
the time the upstream fails you have already told the client 200. A failure after that has to travel
in-band, as an event in the body, and so does success: a client that infers "done" from a closed
socket cannot tell a finished answer from a severed one, because those are the same event.

**Reconnection is the browser's default, not yours.** `EventSource` restarts a closed connection on
its own, after `retry` milliseconds if the server sent one, and the `id` field is what a client
tracks so a server can resume where it left off. How that resumption works is the
[Server-Sent Events](../moving-data/server-sent-events.md) page's subject; what matters here is the
bill. A generative stream that cannot resume regenerates from scratch on every reconnect, so a
flaky connection is charged for the same answer three times, and the user waits for all three.

## Worked example

The server side is three headers and a frame per token, then an explicit terminator:

```js
res.writeHead(200, {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
});

for await (const token of completion) {
  res.write(`data: ${JSON.stringify({ token })}\n\n`);
}
res.write('event: done\ndata: {}\n\n');
res.end();
```

The client side is the part that gets written wrong, because `chunk` is not a message:

```js
let buffer = '';
const decoder = new TextDecoder();

for await (const bytes of stream) {
  buffer += decoder.decode(bytes, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? ''; // the tail may be half a line

  for (const line of lines) {
    if (line.startsWith('data: ')) render(JSON.parse(line.slice(6)));
  }
}
```

`{ stream: true }` is the same idea one level down: it tells the decoder more bytes are coming, so a
multi-byte character split across two chunks survives instead of decoding to a replacement
character.

## Traps

**The last word of the response goes missing, or a JSON parse fails once every few hundred
requests.** A chunk boundary landed inside a message and the parser threw that fragment away. Keep a
buffer, take only the complete frames out of it, and carry the remainder into the next read. This is
the single most common streaming bug and it is invisible in testing, because a small response
arrives in one chunk.

**A half-written answer is shown as if it were the whole answer.** The upstream died at token 200,
your handler logged the error, and the client saw the socket close and rendered what it had. Send an
explicit terminal event on success and an explicit error event on failure, and treat "the connection
ended" as neither.

**It works locally and buffers in production.** Something between you and the browser is collecting
the response before passing it on, which is a proxy doing what proxies do. `Cache-Control: no-cache`
is the start; nginx also needs `X-Accel-Buffering: no`. Related, and worth knowing before you fan
out: over HTTP/1.1 a browser allows about six connections per origin across all tabs, so six open
streams is the whole budget. HTTP/2 negotiates the limit instead, and defaults to a hundred.
